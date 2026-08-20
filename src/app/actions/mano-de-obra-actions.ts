"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { manoDeObraInputSchema } from "@/lib/validation/orden";

export interface ManoDeObraFormState {
  error: string | null;
  success: boolean;
}

export async function addManoDeObraAction(
  ordenId: string,
  prevState: ManoDeObraFormState,
  formData: FormData,
): Promise<ManoDeObraFormState> {
  const parsed = manoDeObraInputSchema.safeParse({
    descripcion: formData.get("descripcion"),
    horas: formData.get("horas"),
    precioHora: formData.get("precioHora"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION", "TECNICO"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    await tenantDb.manoDeObra.create({
      data: {
        ordenId,
        descripcion: parsed.data.descripcion,
        horas: parsed.data.horas,
        precioHora: parsed.data.precioHora,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al agregar la mano de obra"), success: false };
  }

  revalidatePath(`/ordenes/${ordenId}`);
  return { error: null, success: true };
}

export async function deleteManoDeObraAction(id: string, ordenId: string): Promise<void> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  try {
    await tenantDb.manoDeObra.delete({ where: { id } });
  } catch (err) {
    throw new Error(friendlyPrismaErrorMessage(err, "Error al eliminar la mano de obra"));
  }
  revalidatePath(`/ordenes/${ordenId}`);
}
