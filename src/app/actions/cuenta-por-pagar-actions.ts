"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { exigirCajaParaEfectivo, sesionDeCajaAbierta } from "@/lib/caja/sesion";
import { leerOpcionesTaller } from "@/lib/configuracion/opciones-taller";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { getTenantDb } from "@/lib/db/tenant-client";
import { inicioDiaBogota } from "@/lib/fecha-bogota";
import { roundMoney } from "@/lib/money/round";
import {
  agruparCuentasPorPagar,
  resumirEntrada,
  type CuentaPorPagarFila,
  type ProveedorCuentas,
} from "@/lib/proveedores/cuentas-por-pagar";
import { abonoProveedorSchema } from "@/lib/validation/compras";
import type { Prisma, Role } from "@/generated/prisma-tenant";

/**
 * Cuentas por pagar (Fase 24, D5/D6): la deuda la crea la entrada de mercancía
 * (`sincronizarCuentaPorPagar`); aquí solo se abona y se consulta.
 */

const ROLES_ABONO: Role[] = ["ADMIN", "RECEPCION"];

export interface AbonoFormState {
  error: string | null;
  success: boolean;
  /** Al registrar: lo abonado y cómo quedó la cuenta, para el mensaje y la fila resaltada. */
  montoRegistrado?: number;
  saldoRestante?: number;
  cuentaId?: string;
}

const SALDO_INSUFICIENTE = "SALDO_INSUFICIENTE";

export async function abonarCuentaPorPagarAction(
  cuentaId: string,
  prevState: AbonoFormState,
  formData: FormData,
): Promise<AbonoFormState> {
  void prevState;
  const parsed = abonoProveedorSchema.safeParse({
    cuentaId,
    monto: formData.get("monto"),
    metodoPago: formData.get("metodoPago") ?? "",
    referencia: formData.get("referencia") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };

  const session = await requireRole(ROLES_ABONO);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  // La cuenta se alcanza por su entrada, que pertenece a una bodega de la sede.
  const cuenta = await tenantDb.cuentaPorPagar.findFirst({
    where: { id: cuentaId, entrada: { bodega: { sedeId: session.user.sedeActivaId } } },
    select: { id: true, saldoPendiente: true },
  });
  if (!cuenta) return { error: "Cuenta por pagar no encontrada", success: false };
  if (Number(cuenta.saldoPendiente) <= 0) return { error: "Esa cuenta ya está pagada", success: false };

  // Pagar en efectivo saca dinero del cajón (fase de consolidación, D3).
  const errorCaja = await exigirCajaParaEfectivo(
    tenantDb,
    session.user.sedeActivaId,
    parsed.data.metodoPago,
    "Abre la caja antes de pagar en efectivo a un proveedor",
  );
  if (errorCaja) return { error: errorCaja, success: false };

  let saldoRestante: number;
  try {
    saldoRestante = await tenantDb.$transaction(async (tx) => {
      // Guarda atómica: dos personas abonando a la vez no pueden pasarse del saldo.
      const { count } = await tx.cuentaPorPagar.updateMany({
        where: { id: cuentaId, saldoPendiente: { gte: parsed.data.monto } },
        data: { saldoPendiente: { decrement: parsed.data.monto } },
      });
      if (count === 0) throw new Error(SALDO_INSUFICIENTE);

      await tx.pagoProveedor.create({
        data: {
          cuentaId,
          monto: parsed.data.monto,
          metodoPago: parsed.data.metodoPago,
          referencia: parsed.data.referencia ?? null,
          registradoPorId: session.user.id,
        },
      });

      const actualizada = await tx.cuentaPorPagar.findUniqueOrThrow({
        where: { id: cuentaId },
        select: { saldoPendiente: true },
      });
      if (Number(actualizada.saldoPendiente) <= 0) {
        await tx.cuentaPorPagar.update({ where: { id: cuentaId }, data: { estado: "PAGADA" } });
      }
      return Math.max(0, Number(actualizada.saldoPendiente));
    });
  } catch (err) {
    if (err instanceof Error && err.message === SALDO_INSUFICIENTE) {
      return { error: "El monto no puede ser mayor al saldo, o alguien acaba de abonar", success: false };
    }
    return { error: friendlyPrismaErrorMessage(err, "No se pudo registrar el abono"), success: false };
  }

  revalidatePath("/cuentas-por-pagar");
  revalidatePath("/proveedores");
  return { error: null, success: true, montoRegistrado: parsed.data.monto, saldoRestante, cuentaId };
}

export type FiltroCuentasPorPagar = "pendientes" | "pagadas";

/** La pestaña Pagadas muestra las cuentas saldadas en esta ventana. */
const DIAS_PAGADAS = 30;

const SELECT_CUENTA = {
  id: true,
  total: true,
  saldoPendiente: true,
  fecha: true,
  entradaId: true,
  proveedor: { select: { id: true, nombre: true } },
  entrada: {
    select: { items: { select: { repuestoId: true, cantidad: true, repuesto: { select: { nombre: true } } } } },
  },
  pagos: {
    select: {
      id: true,
      monto: true,
      metodoPago: true,
      referencia: true,
      createdAt: true,
      registradoPor: { select: { nombre: true } },
    },
    orderBy: { createdAt: "desc" },
  },
} as const satisfies Prisma.CuentaPorPagarSelect;

type CuentaLeida = Prisma.CuentaPorPagarGetPayload<{ select: typeof SELECT_CUENTA }>;

function aFila(cuenta: CuentaLeida): CuentaPorPagarFila {
  const total = Number(cuenta.total);
  const saldo = Number(cuenta.saldoPendiente);
  return {
    cuentaId: cuenta.id,
    proveedorId: cuenta.proveedor.id,
    proveedorNombre: cuenta.proveedor.nombre,
    entradaId: cuenta.entradaId,
    fecha: cuenta.fecha,
    total,
    saldo,
    pagado: roundMoney(total - saldo),
    entrada: {
      id: cuenta.entradaId,
      ...resumirEntrada(
        cuenta.entrada.items.map((item) => ({
          repuestoId: item.repuestoId,
          nombre: item.repuesto.nombre,
          cantidad: item.cantidad,
        })),
      ),
    },
    pagos: cuenta.pagos.map((pago) => ({
      id: pago.id,
      monto: Number(pago.monto),
      metodoPago: pago.metodoPago,
      referencia: pago.referencia,
      registradoPor: pago.registradoPor.nombre,
      createdAt: pago.createdAt,
    })),
  };
}

export interface CuentasPorPagarDatos {
  /** Lo pendiente, agrupado por proveedor (de aquí salen los KPI y la lectura). */
  proveedores: ProveedorCuentas[];
  totales: ReturnType<typeof agruparCuentasPorPagar>["totales"];
  /** Solo con `filtro: "pagadas"`: lo saldado en los últimos 30 días. */
  pagadas: ProveedorCuentas[] | null;
  /** Para el número de la pestaña Pagadas. */
  conteoPagadas: number;
  /** Falso si el taller usa control de caja y la de la sede está cerrada: no se paga en efectivo. */
  cajaAbierta: boolean;
}

/**
 * Lo que el taller debe, agrupado por proveedor y por antigüedad.
 *
 * `abonadas` son cuentas recién saldadas desde la pantalla (`?abonada=`): siguen
 * en Pendientes con «✓ Pagada» hasta recargar, para que nada desaparezca sin aviso.
 */
export async function getCuentasPorPagar({
  filtro = "pendientes",
  abonadas = [],
}: { filtro?: FiltroCuentasPorPagar; abonadas?: string[] } = {}): Promise<CuentasPorPagarDatos> {
  // Lo que el taller debe es información financiera: la ven ADMIN y RECEPCION,
  // igual que la caja y la cartera (hallazgo B6).
  const session = await requireRole(ROLES_ABONO);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const sedeId = session.user.sedeActivaId;
  const deLaSede = { entrada: { bodega: { sedeId } } };

  const ahora = new Date();
  const desde = new Date(inicioDiaBogota(ahora).getTime() - DIAS_PAGADAS * 24 * 60 * 60 * 1000);
  // «Pagada en los últimos 30 días»: si algún abono cae en la ventana, el último también.
  const wherePagadas = { estado: "PAGADA", ...deLaSede, pagos: { some: { createdAt: { gte: desde } } } } as const;

  const [pendientes, pagadas, conteoPagadas, opciones, sesion] = await Promise.all([
    tenantDb.cuentaPorPagar.findMany({
      where:
        abonadas.length > 0
          ? { ...deLaSede, OR: [{ estado: "PENDIENTE" }, { id: { in: abonadas } }] }
          : { estado: "PENDIENTE", ...deLaSede },
      select: SELECT_CUENTA,
      orderBy: { fecha: "asc" },
    }),
    filtro === "pagadas"
      ? tenantDb.cuentaPorPagar.findMany({ where: wherePagadas, select: SELECT_CUENTA, orderBy: { fecha: "asc" } })
      : null,
    tenantDb.cuentaPorPagar.count({ where: wherePagadas }),
    leerOpcionesTaller(tenantDb),
    sesionDeCajaAbierta(tenantDb, sedeId),
  ]);

  const { proveedores, totales } = agruparCuentasPorPagar(pendientes.map(aFila), ahora);
  return {
    proveedores,
    totales,
    pagadas: pagadas ? agruparCuentasPorPagar(pagadas.map(aFila), ahora).proveedores : null,
    conteoPagadas,
    cajaAbierta: !opciones.usarControlCaja || sesion !== null,
  };
}
