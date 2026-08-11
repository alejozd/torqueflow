"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { vehiculoInputSchema } from "@/lib/validation/vehiculo";
import type { Vehiculo } from "@/generated/prisma-tenant";

export interface VehiculoFormState {
  error: string | null;
  success: boolean;
}

export async function listVehiculosByCliente(clienteId: string): Promise<Vehiculo[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.vehiculo.findMany({ where: { clienteId }, orderBy: { placa: "asc" } });
}

export async function getVehiculo(id: string): Promise<Vehiculo | null> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.vehiculo.findUnique({ where: { id } });
}

export async function createVehiculoAction(
  clienteId: string,
  prevState: VehiculoFormState,
  formData: FormData,
): Promise<VehiculoFormState> {
  const parsed = vehiculoInputSchema.safeParse({
    placa: formData.get("placa") ?? "",
    marca: formData.get("marca") ?? "",
    modelo: formData.get("modelo") ?? "",
    anio: formData.get("anio") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    await tenantDb.vehiculo.create({
      data: {
        placa: parsed.data.placa,
        marca: parsed.data.marca,
        modelo: parsed.data.modelo,
        anio: parsed.data.anio,
        clienteId,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al crear vehículo"), success: false };
  }

  revalidatePath(`/clientes/${clienteId}`);
  return { error: null, success: true };
}

export async function deleteVehiculoAction(id: string, clienteId: string): Promise<void> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  try {
    await tenantDb.vehiculo.delete({ where: { id } });
  } catch (err) {
    throw new Error(friendlyPrismaErrorMessage(err, "Error al eliminar vehículo"));
  }
  revalidatePath(`/clientes/${clienteId}`);
}
