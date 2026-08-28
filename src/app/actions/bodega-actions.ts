"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { bodegaInputSchema } from "@/lib/validation/inventario";
import { scopeBodega } from "@/lib/sede/scope";
import type { Bodega, Prisma } from "@/generated/prisma-tenant";

export interface BodegaFormState {
  error: string | null;
  success: boolean;
}

const NO_ENCONTRADA = "Bodega no encontrada en tu sede activa.";

const BODEGA_INVENTARIO_INCLUDE = {
  repuestos: { select: { stockActual: true, stockMinimo: true, precioCompra: true } },
} satisfies Prisma.BodegaInclude;

export type BodegaConInventario = Prisma.BodegaGetPayload<{ include: typeof BODEGA_INVENTARIO_INCLUDE }>;

export async function listBodegas(): Promise<Bodega[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.bodega.findMany({
    where: { ...scopeBodega(session.user.sedeActivaId) },
    orderBy: { nombre: "asc" },
  });
}

/**
 * Same rows as listBodegas, plus each repuesto's stockActual/stockMinimo/
 * precioCompra -- the raw material the Bodegas listado page aggregates into
 * its Referencias/Unidades/Valor inventario/Stock bajo columns. Kept separate
 * from listBodegas (used by the repuesto/entrada forms' plain <select>
 * dropdowns) so those forms don't pull the extra relation they don't need.
 */
export async function listBodegasConInventario(): Promise<BodegaConInventario[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.bodega.findMany({
    where: { ...scopeBodega(session.user.sedeActivaId) },
    include: BODEGA_INVENTARIO_INCLUDE,
    orderBy: { nombre: "asc" },
  });
}

export async function getBodega(id: string): Promise<Bodega | null> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.bodega.findFirst({ where: { id, ...scopeBodega(session.user.sedeActivaId) } });
}

export async function createBodegaAction(
  prevState: BodegaFormState,
  formData: FormData,
): Promise<BodegaFormState> {
  const parsed = bodegaInputSchema.safeParse({ nombre: formData.get("nombre") ?? "" });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    await tenantDb.bodega.create({
      data: { nombre: parsed.data.nombre, sedeId: session.user.sedeActivaId },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al crear la bodega"), success: false };
  }

  revalidatePath("/bodegas");
  return { error: null, success: true };
}

/**
 * updateMany/deleteMany rather than update/delete by id: only those accept a
 * non-unique column in the where, which is how the sede filter gets in. A
 * count of 0 means the id exists in another sede (or not at all) -- one
 * message for both, so this cannot be used to probe other sedes' ids. Same
 * shape as deleteItemOrdenAction's { id, ordenId } guard from Fase 2.
 */
export async function updateBodegaAction(
  id: string,
  prevState: BodegaFormState,
  formData: FormData,
): Promise<BodegaFormState> {
  const parsed = bodegaInputSchema.safeParse({ nombre: formData.get("nombre") ?? "" });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    const { count } = await tenantDb.bodega.updateMany({
      where: { id, ...scopeBodega(session.user.sedeActivaId) },
      data: { nombre: parsed.data.nombre },
    });
    if (count === 0) {
      return { error: NO_ENCONTRADA, success: false };
    }
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al actualizar la bodega"), success: false };
  }

  revalidatePath("/bodegas");
  return { error: null, success: true };
}

export async function deleteBodegaAction(id: string): Promise<void> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  let count: number;
  try {
    ({ count } = await tenantDb.bodega.deleteMany({
      where: { id, ...scopeBodega(session.user.sedeActivaId) },
    }));
  } catch (err) {
    throw new Error(friendlyPrismaErrorMessage(err, "Error al eliminar la bodega"));
  }
  if (count === 0) {
    throw new Error(NO_ENCONTRADA);
  }
  revalidatePath("/bodegas");
}

/**
 * useActionState-compatible wrapper for deleteBodegaAction, which throws on
 * every refusal (wrong sede, or the FK-restrict error when the bodega still
 * has repuestos) -- same adapter shape as deleteSedeFormAction
 * (src/app/actions/sede-actions.ts).
 */
export async function deleteBodegaFormAction(
  id: string,
  prevState: BodegaFormState,
): Promise<BodegaFormState> {
  try {
    await deleteBodegaAction(id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al eliminar la bodega", success: false };
  }
  return { error: null, success: true };
}
