"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { itemOrdenInputSchema } from "@/lib/validation/orden";
import { assertOrdenMutable } from "@/lib/orden/mutable-guard";

export interface ItemOrdenFormState {
  error: string | null;
  success: boolean;
}

export async function addItemOrdenAction(
  ordenId: string,
  prevState: ItemOrdenFormState,
  formData: FormData,
): Promise<ItemOrdenFormState> {
  const parsed = itemOrdenInputSchema.safeParse({
    descripcion: formData.get("descripcion"),
    cantidad: formData.get("cantidad"),
    precioUnitario: formData.get("precioUnitario"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION", "TECNICO"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const orden = await tenantDb.ordenTrabajo.findUnique({ where: { id: ordenId }, select: { estado: true } });
  if (!orden) {
    return { error: "Orden no encontrada", success: false };
  }
  try {
    assertOrdenMutable(orden);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Orden no modificable", success: false };
  }

  try {
    await tenantDb.itemOrden.create({
      data: {
        ordenId,
        descripcion: parsed.data.descripcion,
        cantidad: parsed.data.cantidad,
        precioUnitario: parsed.data.precioUnitario,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al agregar el ítem"), success: false };
  }

  revalidatePath(`/ordenes/${ordenId}`);
  return { error: null, success: true };
}

export async function deleteItemOrdenAction(id: string, ordenId: string): Promise<void> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const orden = await tenantDb.ordenTrabajo.findUnique({ where: { id: ordenId }, select: { estado: true } });
  if (!orden) {
    throw new Error("Orden no encontrada");
  }
  assertOrdenMutable(orden);

  try {
    await tenantDb.itemOrden.delete({ where: { id } });
  } catch (err) {
    throw new Error(friendlyPrismaErrorMessage(err, "Error al eliminar el ítem"));
  }
  revalidatePath(`/ordenes/${ordenId}`);
}
