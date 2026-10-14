"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import {
  calcularResumenCaja,
  filaCajaCerrada,
  type CajaCerradaFila,
  type Metodo,
  type ResumenCaja,
} from "@/lib/caja/resumen";
import { periodoActualBogota, rangoInstantesDelPeriodo } from "@/lib/gastos/periodo";
import { resolverSede, validarSede } from "@/lib/gastos/validaciones-db";
import { abrirCajaInputSchema, cerrarCajaInputSchema } from "@/lib/validation/caja";
import { periodoSchema } from "@/lib/validation/gasto";

export interface CajaFormState {
  error: string | null;
  success: boolean;
}

export type TipoMovimientoCaja = "PAGO" | "VENTA" | "ANTICIPO" | "DEVOLUCION" | "GASTO" | "PAGO_PROVEEDOR";

export interface MovimientoCajaFila {
  id: string;
  fecha: Date;
  tipo: TipoMovimientoCaja;
  descripcion: string;
  /** Método del movimiento; los gastos siempre son en efectivo. */
  metodo: Metodo;
  /** Positivo = ingreso, negativo = egreso. */
  monto: number;
}

export interface CajaAbierta {
  id: string;
  baseInicial: number;
  abiertaAt: Date;
  abiertaPorNombre: string;
}

export interface CajaActual {
  sedeId: string;
  caja: CajaAbierta | null;
  resumen: ResumenCaja | null;
  movimientos: MovimientoCajaFila[];
}

type TenantDb = ReturnType<typeof getTenantDb>;

const MENSAJE_YA_ABIERTA = "Ya hay una caja abierta en esta sede";

function revalidar() {
  revalidatePath("/caja");
}

/**
 * Movimientos de la sede en la ventana [desde, hasta): pagos de facturas (sin
 * ANTICIPO: ese dinero entró el día del anticipo), anticipos recibidos,
 * devoluciones de anticipo y gastos pagados en efectivo (por fecha de registro).
 */
async function cargarMovimientos(
  tenantDb: TenantDb,
  sedeId: string,
  desde: Date,
  hasta: Date,
): Promise<{ resumenBase: Parameters<typeof calcularResumenCaja>[1]; filas: MovimientoCajaFila[] }> {
  const ventana = { gte: desde, lt: hasta };
  const pagos = await tenantDb.pago.findMany({
    where: { metodoPago: { not: "ANTICIPO" }, createdAt: ventana, factura: { orden: { sedeId } } },
    include: { factura: { select: { numero: true } } },
  });
  const anticipos = await tenantDb.anticipo.findMany({ where: { sedeId, createdAt: ventana } });
  const devoluciones = await tenantDb.anticipo.findMany({
    where: { sedeId, estado: "DEVUELTO", devueltoAt: ventana },
  });
  const gastos = await tenantDb.gasto.findMany({
    where: { sedeId, pagadoEnEfectivo: true, createdAt: ventana },
  });
  // Fase 24: las ventas de mostrador son ingreso y sus devoluciones, egreso.
  const pagosMostrador = await tenantDb.pagoVentaMostrador.findMany({
    where: { createdAt: ventana, venta: { sedeId } },
    include: { venta: { select: { numero: true } } },
  });
  const devolucionesMostrador = await tenantDb.devolucionMostrador.findMany({
    where: { sedeId, createdAt: ventana },
    include: { venta: { select: { numero: true } } },
  });
  // Abonos a proveedores en efectivo: sale dinero del cajón (Fase 24).
  const pagosProveedor = await tenantDb.pagoProveedor.findMany({
    where: { metodoPago: "EFECTIVO", createdAt: ventana, cuenta: { entrada: { bodega: { sedeId } } } },
    include: { cuenta: { select: { proveedor: { select: { nombre: true } } } } },
  });

  const filas: MovimientoCajaFila[] = [
    ...pagos.map((p) => ({
      id: `pago-${p.id}`,
      fecha: p.createdAt,
      tipo: "PAGO" as const,
      descripcion: `Pago factura #${p.factura.numero}`,
      metodo: p.metodoPago as Metodo,
      monto: Number(p.monto),
    })),
    ...anticipos.map((a) => ({
      id: `anticipo-${a.id}`,
      fecha: a.createdAt,
      tipo: "ANTICIPO" as const,
      descripcion: "Anticipo de orden",
      metodo: a.metodoPago as Metodo,
      monto: Number(a.monto),
    })),
    ...devoluciones.map((d) => ({
      id: `devolucion-${d.id}`,
      fecha: d.devueltoAt as Date,
      tipo: "DEVOLUCION" as const,
      descripcion: "Devolución de anticipo",
      metodo: (d.metodoDevolucion ?? "EFECTIVO") as Metodo,
      monto: -Number(d.monto),
    })),
    ...pagosMostrador.map((p) => ({
      id: `venta-${p.id}`,
      fecha: p.createdAt,
      tipo: "VENTA" as const,
      descripcion: `Venta de mostrador #${p.venta.numero}`,
      metodo: p.metodoPago as Metodo,
      monto: Number(p.monto),
    })),
    ...devolucionesMostrador.map((d) => ({
      id: `devolucion-mostrador-${d.id}`,
      fecha: d.createdAt,
      tipo: "DEVOLUCION" as const,
      descripcion: `Devolución venta #${d.venta.numero}`,
      metodo: d.metodoPago as Metodo,
      // Solo lo que salió del cajón: si la venta estaba a crédito, parte (o todo)
      // bajó la deuda del cliente y no es efectivo.
      monto: -Number(d.montoEnEfectivo),
    })),
    ...pagosProveedor.map((p) => ({
      id: `pago-proveedor-${p.id}`,
      fecha: p.createdAt,
      tipo: "PAGO_PROVEEDOR" as const,
      descripcion: `Pago a ${p.cuenta.proveedor.nombre}`,
      metodo: p.metodoPago as Metodo,
      monto: -Number(p.monto),
    })),
    ...gastos.map((g) => ({
      id: `gasto-${g.id}`,
      fecha: g.createdAt,
      tipo: "GASTO" as const,
      descripcion: `Gasto: ${g.descripcion}`,
      metodo: "EFECTIVO" as const,
      monto: -Number(g.monto),
    })),
  ].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

  return {
    resumenBase: {
      pagos: pagos.map((p) => ({ monto: Number(p.monto), metodo: p.metodoPago as Metodo })),
      anticipos: anticipos.map((a) => ({ monto: Number(a.monto), metodo: a.metodoPago as Metodo })),
      devoluciones: [
        ...devoluciones.map((d) => ({
          monto: Number(d.monto),
          metodo: (d.metodoDevolucion ?? "EFECTIVO") as Metodo,
        })),
        ...devolucionesMostrador.map((d) => ({ monto: Number(d.montoEnEfectivo), metodo: d.metodoPago as Metodo })),
      ],
      ventasMostrador: pagosMostrador.map((p) => ({ monto: Number(p.monto), metodo: p.metodoPago as Metodo })),
      gastosEfectivo: gastos.map((g) => Number(g.monto)),
      pagosProveedorEfectivo: pagosProveedor.map((p) => Number(p.monto)),
    },
    filas,
  };
}

export async function getCajaActual(filtros: { sedeId?: string }): Promise<CajaActual> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const sedeId = resolverSede(session, filtros.sedeId);

  const sesion = await tenantDb.cajaSesion.findFirst({
    where: { sedeId, cerradaAt: null },
    include: { abiertaPor: { select: { nombre: true } } },
  });
  if (!sesion) return { sedeId, caja: null, resumen: null, movimientos: [] };

  const { resumenBase, filas } = await cargarMovimientos(tenantDb, sedeId, sesion.abiertaAt, new Date());
  const baseInicial = Number(sesion.baseInicial);
  return {
    sedeId,
    caja: {
      id: sesion.id,
      baseInicial,
      abiertaAt: sesion.abiertaAt,
      abiertaPorNombre: sesion.abiertaPor.nombre,
    },
    resumen: calcularResumenCaja(baseInicial, resumenBase),
    movimientos: filas,
  };
}

export async function abrirCajaAction(prevState: CajaFormState, formData: FormData): Promise<CajaFormState> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const parsed = abrirCajaInputSchema.safeParse({ baseInicial: formData.get("baseInicial") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };

  const tenantDb = getTenantDb(session.user.tenantSchema);
  const sedeId = resolverSede(session, String(formData.get("sedeId") || "") || undefined);
  const errorSede = await validarSede(tenantDb, session, sedeId);
  if (errorSede) return { error: errorSede, success: false };

  const abierta = await tenantDb.cajaSesion.findFirst({ where: { sedeId, cerradaAt: null }, select: { id: true } });
  if (abierta) return { error: MENSAJE_YA_ABIERTA, success: false };

  try {
    await tenantDb.cajaSesion.create({
      data: { sedeId, baseInicial: parsed.data.baseInicial, abiertaPorId: session.user.id },
    });
  } catch (err) {
    // El índice único parcial ataja la apertura concurrente.
    if (err && typeof err === "object" && (err as { code?: unknown }).code === "P2002") {
      return { error: MENSAJE_YA_ABIERTA, success: false };
    }
    return { error: friendlyPrismaErrorMessage(err, "No se pudo abrir la caja"), success: false };
  }
  revalidar();
  return { error: null, success: true };
}

export async function cerrarCajaAction(
  cajaId: string,
  prevState: CajaFormState,
  formData: FormData,
): Promise<CajaFormState> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const parsed = cerrarCajaInputSchema.safeParse({
    efectivoContado: formData.get("efectivoContado") ?? "",
    notas: formData.get("notas") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };

  const tenantDb = getTenantDb(session.user.tenantSchema);
  const sesion = await tenantDb.cajaSesion.findUnique({ where: { id: cajaId } });
  // RECEPCION solo opera en su sede activa; de otra sede la caja "no existe" para ella.
  if (!sesion || (session.user.role === "RECEPCION" && sesion.sedeId !== session.user.sedeActivaId)) {
    return { error: "Caja no encontrada", success: false };
  }
  if (sesion.cerradaAt) return { error: "La caja ya está cerrada", success: false };

  // El esperado se recalcula aquí: nunca se confía en un valor enviado por el cliente.
  const cerradaAt = new Date();
  const { resumenBase } = await cargarMovimientos(tenantDb, sesion.sedeId, sesion.abiertaAt, cerradaAt);
  const { efectivoEsperado } = calcularResumenCaja(Number(sesion.baseInicial), resumenBase);

  let cerradas: number;
  try {
    // Conditional on still being open: two people closing at once must not
    // overwrite each other's count; the second one gets "ya está cerrada".
    ({ count: cerradas } = await tenantDb.cajaSesion.updateMany({
      where: { id: cajaId, cerradaAt: null },
      data: {
        cerradaAt,
        cerradaPorId: session.user.id,
        efectivoEsperado,
        efectivoContado: parsed.data.efectivoContado,
        notas: parsed.data.notas ?? null,
      },
    }));
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo cerrar la caja"), success: false };
  }
  if (cerradas === 0) return { error: "La caja ya está cerrada", success: false };
  revalidar();
  return { error: null, success: true };
}

export async function listCajasCerradas(filtros: { sedeId?: string; periodo?: string }): Promise<CajaCerradaFila[]> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const sedeId = resolverSede(session, filtros.sedeId);
  const periodo = periodoSchema.safeParse(filtros.periodo).success
    ? (filtros.periodo as string)
    : periodoActualBogota(new Date());

  const cajas = await tenantDb.cajaSesion.findMany({
    where: { sedeId, cerradaAt: { not: null }, abiertaAt: rangoInstantesDelPeriodo(periodo) },
    include: { abiertaPor: { select: { nombre: true } }, cerradaPor: { select: { nombre: true } } },
    orderBy: { abiertaAt: "desc" },
  });

  return cajas.map(filaCajaCerrada);
}
