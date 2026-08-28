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
    valor: formData.get("valor"),
    mecanicoId: formData.get("mecanicoId") ?? "",
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

  const mecanicoId = parsed.data.mecanicoId || null;
  if (mecanicoId) {
    // Same sede-membership check asignarMecanicoAction applies to the orden's
    // propio mecánico -- in case the posted id is stale or tampered.
    const tecnico = await tenantDb.usuario.findFirst({
      where: { id: mecanicoId, role: "TECNICO", sedes: { some: { sedeId: session.user.sedeActivaId } } },
      select: { id: true },
    });
    if (!tecnico) {
      return { error: "El técnico seleccionado no existe o no pertenece a esta sede.", success: false };
    }
  }

  try {
    await tenantDb.manoDeObra.create({
      data: {
        ordenId,
        descripcion: parsed.data.descripcion,
        valor: parsed.data.valor,
        mecanicoId,
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
