"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { manoDeObraInputSchema } from "@/lib/validation/orden";
import { assertOrdenMutable } from "@/lib/orden/mutable-guard";
import { scopeOrden } from "@/lib/sede/scope";

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

  const orden = await tenantDb.ordenTrabajo.findFirst({
    where: { id: ordenId, ...scopeOrden(session.user.sedeActivaId) },
    select: { estado: true, factura: { select: { id: true } } },
  });
  if (!orden) {
    return { error: "Orden no encontrada", success: false };
  }
  try {
    assertOrdenMutable(orden);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Orden no modificable", success: false };
  }

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

  const orden = await tenantDb.ordenTrabajo.findFirst({
    where: { id: ordenId, ...scopeOrden(session.user.sedeActivaId) },
    select: { estado: true, factura: { select: { id: true } } },
  });
  if (!orden) {
    throw new Error("Orden no encontrada");
  }
  assertOrdenMutable(orden);

  try {
    const { count } = await tenantDb.manoDeObra.deleteMany({ where: { id, ordenId } });
    if (count === 0) {
      throw new Error("Registro no encontrado en esta orden");
    }
  } catch (err) {
    if (err instanceof Error && err.message === "Registro no encontrado en esta orden") {
      throw err;
    }
    throw new Error(friendlyPrismaErrorMessage(err, "Error al eliminar la mano de obra"));
  }
  revalidatePath(`/ordenes/${ordenId}`);
}
