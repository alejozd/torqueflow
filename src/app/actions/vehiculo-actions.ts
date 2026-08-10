"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { resolveTenant } from "@/lib/tenant/resolve-tenant";
import { getTenantDb } from "@/lib/db/tenant-client";
import { vehiculoInputSchema } from "@/lib/validation/vehiculo";
import type { Vehiculo } from "@/generated/prisma-tenant";

export interface VehiculoFormState {
  error: string | null;
  success: boolean;
}

async function tenantDbOrThrow() {
  const tenant = await resolveTenant();
  if (!tenant) throw new Error("No se pudo resolver el taller actual");
  return getTenantDb(tenant.schemaName);
}

export async function listVehiculosByCliente(clienteId: string): Promise<Vehiculo[]> {
  await requireSession();
  const tenantDb = await tenantDbOrThrow();
  return tenantDb.vehiculo.findMany({ where: { clienteId }, orderBy: { placa: "asc" } });
}

export async function getVehiculo(id: string): Promise<Vehiculo | null> {
  await requireSession();
  const tenantDb = await tenantDbOrThrow();
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

  await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = await tenantDbOrThrow();

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
    return { error: err instanceof Error ? err.message : "Error al crear vehículo", success: false };
  }

  revalidatePath(`/clientes/${clienteId}`);
  return { error: null, success: true };
}

export async function deleteVehiculoAction(id: string, clienteId: string): Promise<void> {
  await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = await tenantDbOrThrow();
  await tenantDb.vehiculo.delete({ where: { id } });
  revalidatePath(`/clientes/${clienteId}`);
}
