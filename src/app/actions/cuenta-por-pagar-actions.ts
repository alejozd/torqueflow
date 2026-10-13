"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { getTenantDb } from "@/lib/db/tenant-client";
import { agruparCuentasPorPagar, type CuentaPorPagarFila } from "@/lib/proveedores/cuentas-por-pagar";
import { abonoProveedorSchema } from "@/lib/validation/compras";
import type { Role } from "@/generated/prisma-tenant";

/**
 * Cuentas por pagar (Fase 24, D5/D6): la deuda la crea la entrada de mercancía
 * (`sincronizarCuentaPorPagar`); aquí solo se abona y se consulta.
 */

const ROLES_ABONO: Role[] = ["ADMIN", "RECEPCION"];

export interface AbonoFormState {
  error: string | null;
  success: boolean;
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

  try {
    await tenantDb.$transaction(async (tx) => {
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
    });
  } catch (err) {
    if (err instanceof Error && err.message === SALDO_INSUFICIENTE) {
      return { error: "El monto no puede ser mayor al saldo, o alguien acaba de abonar", success: false };
    }
    return { error: friendlyPrismaErrorMessage(err, "No se pudo registrar el abono"), success: false };
  }

  revalidatePath("/cuentas-por-pagar");
  revalidatePath("/proveedores");
  return { error: null, success: true };
}

/** Lo que el taller debe, agrupado por proveedor y por antigüedad. */
export async function getCuentasPorPagar(): Promise<{
  proveedores: ReturnType<typeof agruparCuentasPorPagar>["proveedores"];
  totales: ReturnType<typeof agruparCuentasPorPagar>["totales"];
}> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const cuentas = await tenantDb.cuentaPorPagar.findMany({
    where: { estado: "PENDIENTE", entrada: { bodega: { sedeId: session.user.sedeActivaId } } },
    select: {
      id: true,
      total: true,
      saldoPendiente: true,
      fecha: true,
      entradaId: true,
      proveedor: { select: { id: true, nombre: true } },
    },
    orderBy: { fecha: "asc" },
  });

  const filas: CuentaPorPagarFila[] = cuentas.map((cuenta) => ({
    cuentaId: cuenta.id,
    proveedorId: cuenta.proveedor.id,
    proveedorNombre: cuenta.proveedor.nombre,
    entradaId: cuenta.entradaId,
    fecha: cuenta.fecha,
    total: Number(cuenta.total),
    saldo: Number(cuenta.saldoPendiente),
  }));

  return agruparCuentasPorPagar(filas, new Date());
}
