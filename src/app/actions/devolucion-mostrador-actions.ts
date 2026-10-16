"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { registrarEventoAuditoria } from "@/lib/auditoria/registrarEvento";
import { exigirCajaParaEfectivo, ultimoCierreDeCaja } from "@/lib/caja/sesion";
import { leerOpcionesTaller } from "@/lib/configuracion/opciones-taller";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { getTenantDb } from "@/lib/db/tenant-client";
import { puedeDevolver, ventaEnCajaCerrada } from "@/lib/mostrador/plazo-devolucion";
import {
  cantidadDevolvible,
  montoADevolverPermitido,
  repartoDevolucion,
  totalDevolucion,
} from "@/lib/mostrador/ventas";
import { devolucionMostradorInputSchema } from "@/lib/validation/mostrador";
import type { Role } from "@/generated/prisma-tenant";

/**
 * Devolución de una venta de mostrador (Fase 24, D4/D9/D12): devuelve el dinero,
 * reingresa el stock a la bodega del repuesto y queda auditada.
 *
 * Dos reglas que importan:
 * - **Nada se devuelve dos veces**: cada cantidad se compara con lo vendido menos
 *   lo ya devuelto de esa línea, y el dinero con el tope de la venta.
 * - **Si la venta estaba a crédito, primero baja la deuda**: solo el exceso del
 *   valor devuelto sale del cajón (`montoEnEfectivo`), que es lo que cuenta el
 *   arqueo. Devolver dinero por algo que nadie pagó sería un descuadre.
 *
 * Y el plazo (rediseño, D4): hasta 30 días, y de una caja ya cerrada solo ADMIN
 * (`puedeDevolver`), comprobado aquí aunque la pantalla ya lo avise.
 */

const ROLES_DEVOLUCION: Role[] = ["ADMIN", "RECEPCION"];

const SIN_CAJA = "Abre la caja antes de devolver dinero en efectivo en el mostrador";
const DEVOLUCION_YA_REGISTRADA = "DEVOLUCION_YA_REGISTRADA";
const SALDO_CAMBIADO = "SALDO_CAMBIADO";

export interface DevolucionFormState {
  error: string | null;
  success: boolean;
  numero?: number;
}

function leerLineas(formData: FormData): { lineas: { ventaItemId: string; cantidad: number }[] } | { error: string } {
  let crudas: unknown;
  try {
    crudas = JSON.parse(String(formData.get("lineas") ?? "[]"));
  } catch {
    return { error: "No se pudieron leer las líneas de la devolución" };
  }
  if (!Array.isArray(crudas) || crudas.length === 0) return { error: "Elige al menos una línea para devolver" };
  return { lineas: crudas as { ventaItemId: string; cantidad: number }[] };
}

export async function crearDevolucionAction(
  ventaId: string,
  prevState: DevolucionFormState,
  formData: FormData,
): Promise<DevolucionFormState> {
  void prevState;
  const leidas = leerLineas(formData);
  if ("error" in leidas) return { error: leidas.error, success: false };

  const parsed = devolucionMostradorInputSchema.safeParse({
    ventaId,
    lineas: leidas.lineas,
    motivo: formData.get("motivo") ?? "",
    metodoPago: formData.get("metodoPago") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };

  const session = await requireRole(ROLES_DEVOLUCION);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const sedeId = session.user.sedeActivaId;

  const venta = await tenantDb.ventaMostrador.findFirst({
    where: { id: ventaId, sedeId },
    select: {
      id: true,
      subtotal: true,
      total: true,
      saldoPendiente: true,
      createdAt: true,
      items: { select: { id: true, repuestoId: true, descripcion: true, cantidad: true, precioUnitario: true, devueltoCantidad: true } },
      devoluciones: { select: { total: true } },
    },
  });
  if (!venta) return { error: "Venta no encontrada", success: false };

  // Caja cerrada = alguna caja de la sede se cerró después de la venta (su dinero
  // ya pasó por un arqueo). Solo hace falta mirarlo con el control de caja encendido.
  const { usarControlCaja } = await leerOpcionesTaller(tenantDb);
  const ultimoCierreCaja = usarControlCaja ? await ultimoCierreDeCaja(tenantDb, sedeId, venta.createdAt) : null;
  const ahora = new Date();
  const plazo = puedeDevolver({
    fechaVenta: venta.createdAt,
    ahora,
    rol: session.user.role,
    cajaCerrada: ventaEnCajaCerrada({ fechaVenta: venta.createdAt, ahora, usarControlCaja, ultimoCierreCaja }),
  });
  if (!plazo.permitido) return { error: plazo.motivo, success: false };

  // Cada línea elegida tiene que existir en esta venta y caber en lo devolvible.
  const porItem = new Map<
    string,
    { cantidad: number; vendida: number; repuestoId: string | null; descripcion: string; precioUnitario: number }
  >();
  for (const pedida of parsed.data.lineas) {
    const item = venta.items.find((candidato) => candidato.id === pedida.ventaItemId);
    if (!item) return { error: "Una de las líneas no pertenece a esta venta", success: false };
    const disponible = cantidadDevolvible(item.cantidad, item.devueltoCantidad);
    const acumulada = (porItem.get(item.id)?.cantidad ?? 0) + pedida.cantidad;
    if (acumulada > disponible) {
      return {
        error:
          disponible === 0
            ? `"${item.descripcion}" ya se devolvió por completo`
            : `De "${item.descripcion}" solo quedan ${disponible} por devolver`,
        success: false,
      };
    }
    porItem.set(item.id, {
      cantidad: acumulada,
      vendida: item.cantidad,
      repuestoId: item.repuestoId,
      descripcion: item.descripcion,
      precioUnitario: Number(item.precioUnitario),
    });
  }

  const yaDevuelto = venta.devoluciones.reduce((suma, devolucion) => suma + Number(devolucion.total), 0);
  const calculado = totalDevolucion(
    [...porItem.values()].map((linea) => ({ cantidad: linea.cantidad, precioUnitario: linea.precioUnitario })),
    { subtotal: Number(venta.subtotal), total: Number(venta.total) },
  );
  const total = montoADevolverPermitido(Number(venta.total), yaDevuelto, calculado);

  // Lo que se debe del cliente se cancela primero; solo el exceso sale del cajón.
  const { aCuenta, enEfectivo } = repartoDevolucion(total, Number(venta.saldoPendiente));

  // Solo exige caja lo que de verdad sale del cajón en efectivo (fase de
  // consolidación, D3): lo que baja la deuda del cliente no toca el dinero.
  const errorCaja = await exigirCajaParaEfectivo(
    tenantDb,
    sedeId,
    enEfectivo > 0 && parsed.data.metodoPago === "EFECTIVO",
    SIN_CAJA,
  );
  if (errorCaja) return { error: errorCaja, success: false };

  // El stock vuelve por repuesto, agregando las líneas repetidas.
  const porRepuesto = new Map<string, number>();
  for (const linea of porItem.values()) {
    if (!linea.repuestoId) continue;
    porRepuesto.set(linea.repuestoId, (porRepuesto.get(linea.repuestoId) ?? 0) + linea.cantidad);
  }

  let numero: number;
  try {
    const devolucion = await tenantDb.$transaction(async (tx) => {
      // Primero las guardas: cada línea solo avanza si nadie devolvió antes esas
      // unidades. En una venta ya cobrada `aCuenta` es 0, así que la guarda del
      // saldo no protege nada aquí: sin esta, dos devoluciones simultáneas de la
      // misma línea pagarían y reingresarían el stock dos veces.
      for (const [ventaItemId, linea] of porItem) {
        const { count } = await tx.ventaMostradorItem.updateMany({
          where: { id: ventaItemId, devueltoCantidad: { lte: linea.vendida - linea.cantidad } },
          data: { devueltoCantidad: { increment: linea.cantidad } },
        });
        if (count === 0) throw new Error(DEVOLUCION_YA_REGISTRADA);
      }

      if (aCuenta > 0) {
        // Guarda: el saldo pudo cambiar entre la lectura y esta escritura.
        const { count } = await tx.ventaMostrador.updateMany({
          where: { id: ventaId, saldoPendiente: { gte: aCuenta } },
          data: { saldoPendiente: { decrement: aCuenta } },
        });
        if (count === 0) throw new Error(SALDO_CAMBIADO);

        // Si la devolución terminó de saldar la deuda, la venta queda pagada: el
        // estado se deriva del saldo, como en el cobro.
        const actualizada = await tx.ventaMostrador.findUniqueOrThrow({
          where: { id: ventaId },
          select: { saldoPendiente: true },
        });
        if (Number(actualizada.saldoPendiente) <= 0) {
          await tx.ventaMostrador.update({ where: { id: ventaId }, data: { estado: "PAGADA" } });
        }
      }

      for (const [repuestoId, cantidad] of porRepuesto) {
        await tx.repuesto.update({ where: { id: repuestoId }, data: { stockActual: { increment: cantidad } } });
      }

      const creada = await tx.devolucionMostrador.create({
        data: {
          ventaId,
          sedeId,
          motivo: parsed.data.motivo ?? null,
          total,
          montoEnEfectivo: enEfectivo,
          metodoPago: parsed.data.metodoPago,
          creadoPorId: session.user.id,
          items: {
            create: [...porItem.entries()].map(([ventaItemId, linea]) => ({
              ventaItemId,
              repuestoId: linea.repuestoId,
              cantidad: linea.cantidad,
              precioUnitario: linea.precioUnitario,
            })),
          },
        },
        select: { id: true, numero: true },
      });

      await registrarEventoAuditoria(tx, {
        tipo: "VENTA_DEVOLVER",
        actorId: session.user.id,
        entidadTipo: "DevolucionMostrador",
        entidadId: creada.id,
        detalle: { ventaId, numero: creada.numero, total, enEfectivo, aCuenta, motivo: parsed.data.motivo ?? null },
      });

      return creada;
    });
    numero = devolucion.numero;
  } catch (err) {
    if (err instanceof Error && err.message === DEVOLUCION_YA_REGISTRADA) {
      return { error: "Alguien acaba de devolver esas unidades: revisa antes de volver a guardar", success: false };
    }
    if (err instanceof Error && err.message === SALDO_CAMBIADO) {
      return { error: "El saldo de la venta cambió mientras devolvías: revisa antes de guardar", success: false };
    }
    return { error: friendlyPrismaErrorMessage(err, "No se pudo registrar la devolución"), success: false };
  }

  revalidatePath("/mostrador");
  revalidatePath("/caja");
  return { error: null, success: true, numero };
}
