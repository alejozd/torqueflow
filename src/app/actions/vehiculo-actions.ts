"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { vehiculoInputSchema } from "@/lib/validation/vehiculo";
import type { Prisma, Vehiculo } from "@/generated/prisma-tenant";
import { describirHistorial } from "@/lib/historial-eliminacion";

export interface VehiculoFormState {
  error: string | null;
  success: boolean;
  vehiculo?: Vehiculo;
}

export async function listVehiculosByCliente(clienteId: string): Promise<Vehiculo[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.vehiculo.findMany({ where: { clienteId }, orderBy: { placa: "asc" } });
}

// vehiculos/[id]'s owner card needs the cliente's contact fields alongside
// the vehículo itself, in the one fetch the page makes.
const VEHICULO_CON_CLIENTE_INCLUDE = {
  cliente: { select: { id: true, nombre: true, telefono: true, email: true, documento: true } },
} satisfies Prisma.VehiculoInclude;

export type VehiculoConCliente = Prisma.VehiculoGetPayload<{ include: typeof VEHICULO_CON_CLIENTE_INCLUDE }>;

export async function getVehiculo(id: string): Promise<VehiculoConCliente | null> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.vehiculo.findUnique({ where: { id }, include: VEHICULO_CON_CLIENTE_INCLUDE });
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
    marcaId: formData.get("marcaId") || undefined,
    modeloId: formData.get("modeloId") || undefined,
    color: formData.get("color") || undefined,
    anio: formData.get("anio") || undefined,
    combustible: formData.get("combustible") || undefined,
    kilometraje: formData.get("kilometraje") || undefined,
    proximoMantenimiento: formData.get("proximoMantenimiento") || undefined,
    transmision: formData.get("transmision") || undefined,
    observaciones: formData.get("observaciones") || undefined,
    tipo: formData.get("tipo") || undefined,
    vin: formData.get("vin") || undefined,
    soatVence: formData.get("soatVence") || undefined,
    tecnomecanicaVence: formData.get("tecnomecanicaVence") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  let vehiculo: Vehiculo;
  try {
    vehiculo = await tenantDb.vehiculo.create({
      data: {
        placa: parsed.data.placa,
        marca: parsed.data.marca,
        modelo: parsed.data.modelo,
        marcaId: parsed.data.marcaId,
        modeloId: parsed.data.modeloId,
        color: parsed.data.color,
        anio: parsed.data.anio,
        combustible: parsed.data.combustible,
        kilometraje: parsed.data.kilometraje,
        proximoMantenimiento: parsed.data.proximoMantenimiento,
        transmision: parsed.data.transmision,
        observaciones: parsed.data.observaciones,
        tipo: parsed.data.tipo,
        vin: parsed.data.vin,
        soatVence: parsed.data.soatVence,
        tecnomecanicaVence: parsed.data.tecnomecanicaVence,
        clienteId,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al crear vehículo"), success: false };
  }

  revalidatePath(`/clientes/${clienteId}`);
  revalidatePath("/vencimientos");
  return { error: null, success: true, vehiculo };
}

export async function updateVehiculoAction(
  id: string,
  prevState: VehiculoFormState,
  formData: FormData,
): Promise<VehiculoFormState> {
  const parsed = vehiculoInputSchema.safeParse({
    placa: formData.get("placa") ?? "",
    marca: formData.get("marca") ?? "",
    modelo: formData.get("modelo") ?? "",
    marcaId: formData.get("marcaId") || undefined,
    modeloId: formData.get("modeloId") || undefined,
    color: formData.get("color") || undefined,
    anio: formData.get("anio") || undefined,
    combustible: formData.get("combustible") || undefined,
    kilometraje: formData.get("kilometraje") || undefined,
    proximoMantenimiento: formData.get("proximoMantenimiento") || undefined,
    transmision: formData.get("transmision") || undefined,
    observaciones: formData.get("observaciones") || undefined,
    tipo: formData.get("tipo") || undefined,
    vin: formData.get("vin") || undefined,
    soatVence: formData.get("soatVence") || undefined,
    tecnomecanicaVence: formData.get("tecnomecanicaVence") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  let clienteId: string;
  try {
    const updated = await tenantDb.vehiculo.update({
      where: { id },
      data: {
        placa: parsed.data.placa,
        marca: parsed.data.marca,
        modelo: parsed.data.modelo,
        marcaId: parsed.data.marcaId,
        modeloId: parsed.data.modeloId,
        color: parsed.data.color,
        anio: parsed.data.anio,
        combustible: parsed.data.combustible,
        kilometraje: parsed.data.kilometraje,
        proximoMantenimiento: parsed.data.proximoMantenimiento,
        transmision: parsed.data.transmision,
        observaciones: parsed.data.observaciones,
        tipo: parsed.data.tipo,
        vin: parsed.data.vin ?? null,
        soatVence: parsed.data.soatVence ?? null,
        tecnomecanicaVence: parsed.data.tecnomecanicaVence ?? null,
      },
      select: { clienteId: true },
    });
    clienteId = updated.clienteId;
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al actualizar vehículo"), success: false };
  }

  revalidatePath(`/clientes/${clienteId}`);
  revalidatePath(`/vehiculos/${id}`);
  revalidatePath("/vencimientos");
  return { error: null, success: true };
}

/** A vehículo can only be deleted while it has no history (historial, órdenes, citas, cotizaciones). */
export async function deleteVehiculoAction(id: string, clienteId: string): Promise<void> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const vehiculo = await tenantDb.vehiculo.findFirst({
    where: { id, clienteId },
    select: { _count: { select: { historial: true, ordenes: true, citas: true, cotizaciones: true } } },
  });
  if (!vehiculo) throw new Error("Vehículo no encontrado");

  const historial = describirHistorial(vehiculo._count);
  if (historial) {
    throw new Error(`No se puede eliminar el vehículo porque tiene historial: ${historial}.`);
  }

  try {
    await tenantDb.vehiculo.delete({ where: { id } });
  } catch (err) {
    throw new Error(friendlyPrismaErrorMessage(err, "Error al eliminar vehículo"));
  }
  revalidatePath(`/clientes/${clienteId}`);
}

/**
 * useActionState-compatible wrapper (same adapter shape as
 * deleteProveedorFormAction): a refusal comes back as an inline error
 * instead of crashing to the nearest error boundary.
 */
export async function deleteVehiculoFormAction(
  id: string,
  clienteId: string,
  _prevState: VehiculoFormState,
): Promise<VehiculoFormState> {
  try {
    await deleteVehiculoAction(id, clienteId);
  } catch (err) {
    if (typeof (err as { digest?: unknown })?.digest === "string" && (err as { digest: string }).digest.startsWith("NEXT_")) {
      throw err;
    }
    return { error: err instanceof Error ? err.message : "Error al eliminar vehículo", success: false };
  }
  return { error: null, success: true };
}
