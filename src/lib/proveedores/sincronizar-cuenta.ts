import type { getTenantDb } from "@/lib/db/tenant-client";

/**
 * Cuentas por pagar (Fase 24, D5): la deuda nace de la **entrada de mercancía**,
 * que es el hecho económico y el único punto que ya mueve el stock.
 *
 * Hay dos caminos que crean una entrada y los dos tienen que terminar con la
 * misma deuda, así que esto es un único sincronizador en vez de dos copias:
 * - la entrada suelta, que **añade los ítems uno a uno** (por eso el total se
 *   recalcula cada vez, en vez de fijarse al crear la entrada);
 * - la recepción de un pedido, que crea los ítems de golpe.
 *
 * El total sale de los ítems y el saldo de restar lo ya abonado, así que volver a
 * llamarlo es inocuo (idempotente). `entradaId` es único en la tabla: no puede
 * haber dos deudas por la misma entrada.
 */

type ClienteTransaccion = Pick<
  ReturnType<typeof getTenantDb>,
  "entradaMercancia" | "cuentaPorPagar" | "pagoProveedor"
>;

export async function sincronizarCuentaPorPagar(
  tx: ClienteTransaccion,
  entradaId: string,
  creadoPorId: string,
): Promise<void> {
  const entrada = await tx.entradaMercancia.findUniqueOrThrow({
    where: { id: entradaId },
    select: {
      proveedorId: true,
      createdAt: true,
      items: { select: { cantidad: true, precioCompraUnitario: true } },
      cuentaPorPagar: {
        select: { id: true, total: true },
      },
    },
  });

  const total = entrada.items.reduce(
    (suma, item) => suma + item.cantidad * Number(item.precioCompraUnitario),
    0,
  );
  const totalRedondeado = Math.round(total * 100) / 100;

  if (!entrada.cuentaPorPagar) {
    await tx.cuentaPorPagar.create({
      data: {
        entradaId,
        proveedorId: entrada.proveedorId,
        total: totalRedondeado,
        saldoPendiente: totalRedondeado,
        estado: totalRedondeado <= 0 ? "PAGADA" : "PENDIENTE",
        fecha: entrada.createdAt,
        creadoPorId,
      },
    });
    return;
  }

  // Ya existe (se añadió otro ítem, o se está re-sincronizando). El saldo se
  // ajusta con un **incremento del cambio del total**, nunca escribiendo un valor
  // absoluto calculado con una lectura previa: eso pisaría un abono simultáneo
  // (los abonos usan un decremento guardado).
  const delta = Math.round((totalRedondeado - Number(entrada.cuentaPorPagar.total)) * 100) / 100;

  if (delta !== 0) {
    await tx.cuentaPorPagar.update({
      where: { id: entrada.cuentaPorPagar.id },
      data: { total: totalRedondeado, saldoPendiente: { increment: delta } },
    });
  } else {
    await tx.cuentaPorPagar.update({
      where: { id: entrada.cuentaPorPagar.id },
      data: { total: totalRedondeado },
    });
  }

  const actualizada = await tx.cuentaPorPagar.findUniqueOrThrow({
    where: { id: entrada.cuentaPorPagar.id },
    select: { saldoPendiente: true },
  });
  const saldoCero = Number(actualizada.saldoPendiente) <= 0;
  await tx.cuentaPorPagar.update({
    where: { id: entrada.cuentaPorPagar.id },
    data: { estado: saldoCero ? "PAGADA" : "PENDIENTE" },
  });
}
