"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { sesionDeCajaAbierta } from "@/lib/caja/sesion";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { getTenantDb } from "@/lib/db/tenant-client";
import { calcularTotalesVenta } from "@/lib/mostrador/ventas";
import { cobroVentaSchema, ventaMostradorInputSchema, type VentaMostradorInput } from "@/lib/validation/mostrador";
import type { Role } from "@/generated/prisma-tenant";

/**
 * Venta de mostrador (Fase 24, D1/D2/D8): documento propio, sin orden de trabajo,
 * con la sede de la sesión, cobro inmediato o a crédito si hay cliente, y el stock
 * descontado **con guarda y dentro de la misma transacción** que la venta.
 *
 * Cobrar (vender o abonar) exige caja abierta: es la única forma de que ningún
 * movimiento de dinero quede fuera del arqueo (D2).
 */

const ROLES_VENTA: Role[] = ["ADMIN", "RECEPCION", "TECNICO"];
const ROLES_COBRO: Role[] = ["ADMIN", "RECEPCION"];

const SIN_CAJA = "Abre la caja antes de cobrar en el mostrador";
const SALDO_INSUFICIENTE = "SALDO_INSUFICIENTE";
const STOCK_INSUFICIENTE = "STOCK_INSUFICIENTE";

export interface VentaMostradorFormState {
  error: string | null;
  success: boolean;
  /** Número de la venta creada, para confirmárselo al cliente. */
  numero?: number;
}

/** Las líneas llegan como JSON en un campo `lineas`: el carrito las arma en el cliente. */
function leerVenta(formData: FormData): { datos: VentaMostradorInput } | { error: string } {
  let lineas: unknown;
  try {
    lineas = JSON.parse(String(formData.get("lineas") ?? "[]"));
  } catch {
    return { error: "No se pudieron leer los productos de la venta" };
  }

  const parsed = ventaMostradorInputSchema.safeParse({
    clienteId: formData.get("clienteId") ?? "",
    lineas,
    descuento: formData.get("descuento") ?? "",
    metodoPago: formData.get("metodoPago") ?? "",
    referencia: formData.get("referencia") ?? "",
    cobrarTodo: formData.get("cobrarTodo") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  return { datos: parsed.data };
}

export async function crearVentaMostradorAction(
  prevState: VentaMostradorFormState,
  formData: FormData,
): Promise<VentaMostradorFormState> {
  void prevState;
  const leida = leerVenta(formData);
  if ("error" in leida) return { error: leida.error, success: false };
  const datos = leida.datos;

  const session = await requireRole(ROLES_VENTA);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const sedeId = session.user.sedeActivaId;

  if (!(await sesionDeCajaAbierta(tenantDb, sedeId))) return { error: SIN_CAJA, success: false };

  if (datos.clienteId) {
    const cliente = await tenantDb.cliente.findFirst({ where: { id: datos.clienteId }, select: { id: true } });
    if (!cliente) return { error: "Cliente no encontrado", success: false };
  } else if (!datos.cobrarTodo) {
    // Sin cliente identificado no hay a quién cobrarle después.
    return { error: "Sin cliente identificado, la venta tiene que quedar pagada", success: false };
  }

  const totales = calcularTotalesVenta(datos.lineas, datos.descuento);

  // El stock se descuenta por repuesto, agregando las líneas repetidas (D8).
  const porRepuesto = new Map<string, { cantidad: number; descripcion: string }>();
  for (const linea of datos.lineas) {
    if (!linea.repuestoId) continue;
    const acumulado = porRepuesto.get(linea.repuestoId);
    porRepuesto.set(linea.repuestoId, {
      cantidad: (acumulado?.cantidad ?? 0) + linea.cantidad,
      descripcion: linea.descripcion,
    });
  }

  let numero: number;
  try {
    const venta = await tenantDb.$transaction(async (tx) => {
      for (const [repuestoId, linea] of porRepuesto) {
        const { count } = await tx.repuesto.updateMany({
          where: { id: repuestoId, stockActual: { gte: linea.cantidad } },
          data: { stockActual: { decrement: linea.cantidad } },
        });
        if (count === 0) throw new Error(`${STOCK_INSUFICIENTE}:${linea.descripcion}`);
      }

      const creada = await tx.ventaMostrador.create({
        data: {
          sedeId,
          clienteId: datos.clienteId ?? null,
          subtotal: totales.subtotal,
          descuento: totales.descuento,
          iva: totales.iva,
          total: totales.total,
          saldoPendiente: datos.cobrarTodo ? 0 : totales.total,
          estado: datos.cobrarTodo ? "PAGADA" : "PENDIENTE",
          creadoPorId: session.user.id,
          items: {
            create: datos.lineas.map((linea) => ({
              repuestoId: linea.repuestoId ?? null,
              descripcion: linea.descripcion,
              cantidad: linea.cantidad,
              precioUnitario: linea.precioUnitario,
            })),
          },
        },
        select: { id: true, numero: true },
      });

      if (datos.cobrarTodo) {
        await tx.pagoVentaMostrador.create({
          data: {
            ventaId: creada.id,
            monto: totales.total,
            metodoPago: datos.metodoPago,
            referencia: datos.referencia ?? null,
            registradoPorId: session.user.id,
          },
        });
      }

      return creada;
    });
    numero = venta.numero;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith(STOCK_INSUFICIENTE)) {
      const descripcion = err.message.slice(STOCK_INSUFICIENTE.length + 1);
      return { error: `No hay stock suficiente de "${descripcion}"`, success: false };
    }
    return { error: friendlyPrismaErrorMessage(err, "No se pudo registrar la venta"), success: false };
  }

  revalidatePath("/mostrador");
  revalidatePath("/caja");
  return { error: null, success: true, numero };
}

export async function cobrarVentaMostradorAction(
  ventaId: string,
  prevState: VentaMostradorFormState,
  formData: FormData,
): Promise<VentaMostradorFormState> {
  void prevState;
  const parsed = cobroVentaSchema.safeParse({
    monto: formData.get("monto"),
    metodoPago: formData.get("metodoPago") ?? "",
    referencia: formData.get("referencia") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };

  const session = await requireRole(ROLES_COBRO);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const sedeId = session.user.sedeActivaId;

  const venta = await tenantDb.ventaMostrador.findFirst({
    where: { id: ventaId, sedeId },
    select: { id: true, numero: true, saldoPendiente: true },
  });
  if (!venta) return { error: "Venta no encontrada", success: false };
  if (Number(venta.saldoPendiente) <= 0) return { error: "Esa venta ya está pagada", success: false };
  if (!(await sesionDeCajaAbierta(tenantDb, sedeId))) return { error: SIN_CAJA, success: false };

  try {
    await tenantDb.$transaction(async (tx) => {
      // Guarda atómica: si otra persona cobró o el saldo cambió, no se cobra dos veces.
      const { count } = await tx.ventaMostrador.updateMany({
        where: { id: ventaId, saldoPendiente: { gte: parsed.data.monto } },
        data: { saldoPendiente: { decrement: parsed.data.monto } },
      });
      if (count === 0) throw new Error(SALDO_INSUFICIENTE);

      await tx.pagoVentaMostrador.create({
        data: {
          ventaId,
          monto: parsed.data.monto,
          metodoPago: parsed.data.metodoPago,
          referencia: parsed.data.referencia ?? null,
          registradoPorId: session.user.id,
        },
      });

      const actualizada = await tx.ventaMostrador.findUniqueOrThrow({
        where: { id: ventaId },
        select: { saldoPendiente: true },
      });
      if (Number(actualizada.saldoPendiente) <= 0) {
        await tx.ventaMostrador.update({ where: { id: ventaId }, data: { estado: "PAGADA" } });
      }
    });
  } catch (err) {
    if (err instanceof Error && err.message === SALDO_INSUFICIENTE) {
      return { error: "El monto no puede ser mayor al saldo, o alguien acaba de cobrar", success: false };
    }
    return { error: friendlyPrismaErrorMessage(err, "No se pudo registrar el cobro"), success: false };
  }

  revalidatePath("/mostrador");
  revalidatePath("/caja");
  return { error: null, success: true, numero: venta.numero };
}
