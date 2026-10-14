import type { Prisma } from "@/generated/prisma-tenant";
import { formatoDiaBogota } from "@/lib/fecha-bogota";

/**
 * Cuentas por pagar (Fase 24, D5): la deuda nace de la **entrada de mercancía**,
 * que es el hecho económico y el único punto que ya mueve el stock.
 *
 * Hay dos caminos que crean una entrada y los dos tienen que terminar con la
 * misma deuda, así que esto es un único sincronizador en vez de dos copias:
 * - la entrada suelta, que **añade los ítems uno a uno** (por eso el total se
 *   recalcula cada vez, en vez de fijarse al crear la entrada);
 * - la recepción de un pedido, que crea los ítems de golpe.
 * (La carga inicial de la importación de Excel no crea deuda: es inventario de
 * arranque, no una compra.)
 *
 * Concurrencia (fase de consolidación, hallazgo M3): antes el saldo se movía por
 * la diferencia contra el `total` guardado, y dos ítems añadidos a la vez dejaban
 * ese total sin uno de ellos; el siguiente ítem lo volvía a sumar y la deuda
 * quedaba inflada. Ahora:
 * - se **bloquea la fila de la entrada** (`FOR UPDATE`) antes de leer sus ítems:
 *   dos sincronizaciones de la misma entrada se ponen en fila, y la segunda ve
 *   el ítem de la primera;
 * - se **bloquea la fila de la cuenta** antes de sumar los abonos: un abono
 *   simultáneo (que hace `updateMany` sobre esa fila) espera, o ya terminó y su
 *   pago entra en la suma;
 * - el saldo es **total − Σ abonos**, sin deltas: el total guardado no interviene,
 *   así que volver a llamarlo es inocuo (idempotente).
 *
 * `entradaId` es único en la tabla: no puede haber dos deudas por la misma entrada.
 */

type ClienteTransaccion = Pick<
  Prisma.TransactionClient,
  "$queryRaw" | "entradaMercancia" | "cuentaPorPagar" | "pagoProveedor"
>;

const redondear = (valor: number) => Math.round(valor * 100) / 100;

export async function sincronizarCuentaPorPagar(
  tx: ClienteTransaccion,
  entradaId: string,
  creadoPorId: string,
): Promise<void> {
  // El cliente del taller fija el `search_path` con el schema de su URL, así que
  // el nombre de la tabla va sin calificar.
  await tx.$queryRaw`SELECT id FROM entradas_mercancia WHERE id = ${entradaId} FOR UPDATE`;

  const entrada = await tx.entradaMercancia.findUniqueOrThrow({
    where: { id: entradaId },
    select: {
      proveedorId: true,
      createdAt: true,
      items: { select: { cantidad: true, precioCompraUnitario: true } },
      cuentaPorPagar: { select: { id: true } },
    },
  });

  const total = redondear(
    entrada.items.reduce((suma, item) => suma + item.cantidad * Number(item.precioCompraUnitario), 0),
  );

  if (!entrada.cuentaPorPagar) {
    await tx.cuentaPorPagar.create({
      data: {
        entradaId,
        proveedorId: entrada.proveedorId,
        total,
        saldoPendiente: total,
        estado: total <= 0 ? "PAGADA" : "PENDIENTE",
        // `fecha` es de solo día (@db.Date): el día de Bogotá de la entrada. Con el
        // instante, Prisma guardaba el día UTC y una compra de la noche quedaba al día siguiente.
        fecha: new Date(`${formatoDiaBogota.format(entrada.createdAt)}T00:00:00.000Z`),
        creadoPorId,
      },
    });
    return;
  }

  const cuentaId = entrada.cuentaPorPagar.id;
  await tx.$queryRaw`SELECT id FROM cuentas_por_pagar WHERE id = ${cuentaId} FOR UPDATE`;
  const { _sum } = await tx.pagoProveedor.aggregate({ where: { cuentaId }, _sum: { monto: true } });
  const saldo = Math.max(0, redondear(total - Number(_sum.monto ?? 0)));

  await tx.cuentaPorPagar.update({
    where: { id: cuentaId },
    data: { total, saldoPendiente: saldo, estado: saldo <= 0 ? "PAGADA" : "PENDIENTE" },
  });
}
