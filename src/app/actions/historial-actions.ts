"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { historialInputSchema } from "@/lib/validation/historial";
import type { HistorialVehiculo } from "@/generated/prisma-tenant";

export interface HistorialFormState {
  error: string | null;
  success: boolean;
}

export async function listHistorial(vehiculoId: string): Promise<HistorialVehiculo[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.historialVehiculo.findMany({
    where: { vehiculoId },
    orderBy: { fecha: "desc" },
  });
}

export async function addHistorialEntryAction(
  vehiculoId: string,
  prevState: HistorialFormState,
  formData: FormData,
): Promise<HistorialFormState> {
  const parsed = historialInputSchema.safeParse({ descripcion: formData.get("descripcion") });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION", "TECNICO"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    await tenantDb.historialVehiculo.create({
      data: { descripcion: parsed.data.descripcion, vehiculoId, autorId: session.user.id },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al registrar entrada"), success: false };
  }

  revalidatePath(`/vehiculos/${vehiculoId}`);
  return { error: null, success: true };
}
