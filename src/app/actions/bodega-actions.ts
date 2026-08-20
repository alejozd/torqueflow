"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { bodegaInputSchema } from "@/lib/validation/inventario";
import type { Bodega } from "@/generated/prisma-tenant";

export interface BodegaFormState {
  error: string | null;
  success: boolean;
}

export async function listBodegas(): Promise<Bodega[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.bodega.findMany({ orderBy: { nombre: "asc" } });
}

export async function getBodega(id: string): Promise<Bodega | null> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.bodega.findUnique({ where: { id } });
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

  const sede = await tenantDb.sede.findFirst({ orderBy: { createdAt: "asc" } });
  if (!sede) {
    return { error: "No hay una sede configurada para este taller.", success: false };
  }

  try {
    await tenantDb.bodega.create({ data: { nombre: parsed.data.nombre, sedeId: sede.id } });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al crear la bodega"), success: false };
  }

  revalidatePath("/bodegas");
  return { error: null, success: true };
}

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
    await tenantDb.bodega.update({ where: { id }, data: { nombre: parsed.data.nombre } });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al actualizar la bodega"), success: false };
  }

  revalidatePath("/bodegas");
  return { error: null, success: true };
}

export async function deleteBodegaAction(id: string): Promise<void> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  try {
    await tenantDb.bodega.delete({ where: { id } });
  } catch (err) {
    throw new Error(friendlyPrismaErrorMessage(err, "Error al eliminar la bodega"));
  }
  revalidatePath("/bodegas");
}
