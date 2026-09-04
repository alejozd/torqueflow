"use server";

import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { marcaVehiculoInputSchema, modeloVehiculoInputSchema } from "@/lib/validation/vehiculo-marca-modelo";
import type { MarcaVehiculo, ModeloVehiculo } from "@/generated/prisma-tenant";

export interface MarcaVehiculoFormState {
  error: string | null;
  success: boolean;
  marca?: MarcaVehiculo;
}

export interface ModeloVehiculoFormState {
  error: string | null;
  success: boolean;
  modelo?: ModeloVehiculo;
}

/**
 * MarcaVehiculo/ModeloVehiculo are per-tenant (schema tenant, not the shared
 * public schema -- see prisma/tenant/schema.prisma) but NOT sede-scoped, same
 * as Vehiculo itself: a marca/modelo belongs to the whole taller, not one of
 * its sedes.
 */
export async function listMarcasVehiculo(): Promise<MarcaVehiculo[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.marcaVehiculo.findMany({ orderBy: { nombre: "asc" } });
}

export async function listModelosVehiculo(marcaId: string): Promise<ModeloVehiculo[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.modeloVehiculo.findMany({ where: { marcaId }, orderBy: { nombre: "asc" } });
}

export async function crearMarcaVehiculoAction(
  prevState: MarcaVehiculoFormState,
  formData: FormData,
): Promise<MarcaVehiculoFormState> {
  const parsed = marcaVehiculoInputSchema.safeParse({ nombre: formData.get("nombre") ?? "" });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    const marca = await tenantDb.marcaVehiculo.create({ data: { nombre: parsed.data.nombre } });
    return { error: null, success: true, marca };
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al crear la marca"), success: false };
  }
}

export async function crearModeloVehiculoAction(
  prevState: ModeloVehiculoFormState,
  formData: FormData,
): Promise<ModeloVehiculoFormState> {
  const parsed = modeloVehiculoInputSchema.safeParse({
    marcaId: formData.get("marcaId") ?? "",
    nombre: formData.get("nombre") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    const modelo = await tenantDb.modeloVehiculo.create({
      data: { marcaId: parsed.data.marcaId, nombre: parsed.data.nombre },
    });
    return { error: null, success: true, modelo };
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al crear el modelo"), success: false };
  }
}
