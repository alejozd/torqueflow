"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { resolveTenant } from "@/lib/tenant/resolve-tenant";
import { getTenantDb } from "@/lib/db/tenant-client";
import { historialInputSchema } from "@/lib/validation/historial";
import type { HistorialVehiculo } from "@/generated/prisma-tenant";

export interface HistorialFormState {
  error: string | null;
  success: boolean;
}

async function tenantDbOrThrow() {
  const tenant = await resolveTenant();
  if (!tenant) throw new Error("No se pudo resolver el taller actual");
  return getTenantDb(tenant.schemaName);
}

export async function listHistorial(vehiculoId: string): Promise<HistorialVehiculo[]> {
  await requireSession();
  const tenantDb = await tenantDbOrThrow();
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
  const tenantDb = await tenantDbOrThrow();

  try {
    await tenantDb.historialVehiculo.create({
      data: { descripcion: parsed.data.descripcion, vehiculoId, autorId: session.user.id },
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al registrar entrada", success: false };
  }

  revalidatePath(`/vehiculos/${vehiculoId}`);
  return { error: null, success: true };
}
