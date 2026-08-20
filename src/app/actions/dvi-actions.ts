"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { saveDviFoto } from "@/lib/storage/local-file-storage";
import { DVI_CHECKLIST_ITEMS, type DviChecklist } from "@/lib/dvi/checklist-items";
import { dviChecklistStatusSchema, dviFotoMomentoSchema } from "@/lib/validation/dvi";
import { assertOrdenMutable } from "@/lib/orden/mutable-guard";

export interface DviFormState {
  error: string | null;
  success: boolean;
}

export async function updateDviChecklistAction(
  ordenId: string,
  prevState: DviFormState,
  formData: FormData,
): Promise<DviFormState> {
  const checklist: DviChecklist = {};
  for (const item of DVI_CHECKLIST_ITEMS) {
    const parsed = dviChecklistStatusSchema.safeParse(formData.get(item.key));
    if (parsed.success) {
      checklist[item.key] = parsed.data;
    }
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
    await tenantDb.dvi.upsert({
      where: { ordenId },
      create: { ordenId, checklist, creadoPorId: session.user.id },
      update: { checklist },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al guardar el checklist"), success: false };
  }

  revalidatePath(`/ordenes/${ordenId}`);
  return { error: null, success: true };
}

export async function addDviFotoAction(
  ordenId: string,
  prevState: DviFormState,
  formData: FormData,
): Promise<DviFormState> {
  const momentoParsed = dviFotoMomentoSchema.safeParse(formData.get("momento"));
  const file = formData.get("foto");

  if (!momentoParsed.success) {
    return { error: "Selecciona si la foto es antes o después", success: false };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecciona un archivo de imagen", success: false };
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

  const dvi = await tenantDb.dvi.findUnique({ where: { ordenId } });
  if (!dvi) {
    return { error: "Primero guarda el checklist de inspección", success: false };
  }

  let saved: Awaited<ReturnType<typeof saveDviFoto>>;
  try {
    saved = await saveDviFoto(session.user.tenantSchema, dvi.id, file);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al guardar la foto", success: false };
  }

  try {
    await tenantDb.dviFoto.create({
      data: { dviId: dvi.id, momento: momentoParsed.data, url: saved.url },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al registrar la foto"), success: false };
  }

  revalidatePath(`/ordenes/${ordenId}`);
  return { error: null, success: true };
}

export async function deleteDviFotoAction(id: string, ordenId: string): Promise<void> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const orden = await tenantDb.ordenTrabajo.findUnique({ where: { id: ordenId }, select: { estado: true } });
  if (!orden) {
    throw new Error("Orden no encontrada");
  }
  assertOrdenMutable(orden);

  await tenantDb.dviFoto.delete({ where: { id } });
  revalidatePath(`/ordenes/${ordenId}`);
}
