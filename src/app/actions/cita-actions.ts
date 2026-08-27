"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { citaInputSchema, estadoCitaSchema } from "@/lib/validation/cita";
import { scopeCita } from "@/lib/sede/scope";
import type { EstadoCita, Prisma } from "@/generated/prisma-tenant";

export interface CitaFormState {
  error: string | null;
  success: boolean;
}

export interface VehiculoOption {
  id: string;
  placa: string;
  marca: string;
  modelo: string;
  clienteNombre: string;
}

const CITA_DETALLE_INCLUDE = {
  cliente: { select: { id: true, nombre: true, telefono: true, email: true } },
  vehiculo: { select: { id: true, placa: true, marca: true, modelo: true, anio: true } },
  creadoPor: { select: { id: true, nombre: true } },
} satisfies Prisma.CitaInclude;

export type CitaConDetalle = Prisma.CitaGetPayload<{ include: typeof CITA_DETALLE_INCLUDE }>;

const NO_ENCONTRADA = "Cita no encontrada";

function parseCitaFormData(formData: FormData) {
  return citaInputSchema.safeParse({
    vehiculoId: formData.get("vehiculoId") ?? "",
    fechaHora: formData.get("fechaHora") ?? "",
    motivo: formData.get("motivo") ?? "",
    notas: formData.get("notas") ?? "",
  });
}

function revalidarCitas(id?: string): void {
  revalidatePath("/citas");
  if (id) {
    revalidatePath(`/citas/${id}`);
  }
}

/**
 * The agenda is readable by every authenticated role: a técnico needs to know
 * what is arriving at their sede today, even though they cannot book.
 */
export async function listCitas(estado?: EstadoCita): Promise<CitaConDetalle[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.cita.findMany({
    where: { ...scopeCita(session.user.sedeActivaId), ...(estado ? { estado } : {}) },
    include: CITA_DETALLE_INCLUDE,
    orderBy: { fechaHora: "asc" },
  });
}

export async function getCita(id: string): Promise<CitaConDetalle | null> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  // findFirst, not findUnique: findUnique cannot carry the sede filter, so an id
  // from another sede would resolve. This is the IDOR boundary.
  return tenantDb.cita.findFirst({
    where: { id, ...scopeCita(session.user.sedeActivaId) },
    include: CITA_DETALLE_INCLUDE,
  });
}

/**
 * Deliberately NOT sede-scoped. Clientes and vehículos are tenant-wide by
 * design (design doc §5, módulo 12): the same customer may bring the same car
 * to any sede of the same taller, so any sede must be able to book it.
 */
export async function listVehiculosParaCita(): Promise<VehiculoOption[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const vehiculos = await tenantDb.vehiculo.findMany({
    select: {
      id: true,
      placa: true,
      marca: true,
      modelo: true,
      cliente: { select: { nombre: true } },
    },
    orderBy: { placa: "asc" },
  });

  return vehiculos.map((vehiculo) => ({
    id: vehiculo.id,
    placa: vehiculo.placa,
    marca: vehiculo.marca,
    modelo: vehiculo.modelo,
    clienteNombre: vehiculo.cliente.nombre,
  }));
}

export async function createCitaAction(
  prevState: CitaFormState,
  formData: FormData,
): Promise<CitaFormState> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);

  const parsed = parseCitaFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const tenantDb = getTenantDb(session.user.tenantSchema);

  // The cliente is derived from the vehículo, never taken from the form: that
  // makes "book vehicle X under client Y" unrepresentable.
  const vehiculo = await tenantDb.vehiculo.findUnique({
    where: { id: parsed.data.vehiculoId },
    select: { id: true, clienteId: true },
  });
  if (!vehiculo) {
    return { error: "El vehículo seleccionado no existe.", success: false };
  }

  try {
    await tenantDb.cita.create({
      data: {
        clienteId: vehiculo.clienteId,
        vehiculoId: vehiculo.id,
        sedeId: session.user.sedeActivaId,
        fechaHora: parsed.data.fechaHora,
        motivo: parsed.data.motivo,
        notas: parsed.data.notas || null,
        creadoPorId: session.user.id,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al crear la cita"), success: false };
  }

  revalidarCitas();
  return { error: null, success: true };
}

export async function updateCitaAction(
  id: string,
  prevState: CitaFormState,
  formData: FormData,
): Promise<CitaFormState> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);

  const parsed = parseCitaFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const tenantDb = getTenantDb(session.user.tenantSchema);

  const vehiculo = await tenantDb.vehiculo.findUnique({
    where: { id: parsed.data.vehiculoId },
    select: { id: true, clienteId: true },
  });
  if (!vehiculo) {
    return { error: "El vehículo seleccionado no existe.", success: false };
  }

  try {
    // updateMany, not update: update({ where: { id } }) accepts only unique
    // columns, so it cannot carry the sede filter and would write across sedes.
    const { count } = await tenantDb.cita.updateMany({
      where: { id, ...scopeCita(session.user.sedeActivaId) },
      data: {
        vehiculoId: vehiculo.id,
        clienteId: vehiculo.clienteId,
        fechaHora: parsed.data.fechaHora,
        motivo: parsed.data.motivo,
        notas: parsed.data.notas || null,
      },
    });
    if (count === 0) {
      return { error: NO_ENCONTRADA, success: false };
    }
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al actualizar la cita"), success: false };
  }

  revalidarCitas(id);
  return { error: null, success: true };
}

/**
 * Cancelling is ordinary front-desk work, so this stays ADMIN+RECEPCION. There
 * is no transition table (unlike EstadoOrden): an appointment can legitimately
 * move back from CONFIRMADA to PROGRAMADA when a customer reschedules by phone.
 */
export async function cambiarEstadoCitaAction(
  id: string,
  prevState: CitaFormState,
  formData: FormData,
): Promise<CitaFormState> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);

  const parsed = estadoCitaSchema.safeParse(formData.get("estado") ?? "");
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Estado de cita inválido", success: false };
  }

  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    const { count } = await tenantDb.cita.updateMany({
      where: { id, ...scopeCita(session.user.sedeActivaId) },
      data: { estado: parsed.data },
    });
    if (count === 0) {
      return { error: NO_ENCONTRADA, success: false };
    }
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al cambiar el estado de la cita"), success: false };
  }

  revalidarCitas(id);
  return { error: null, success: true };
}

/**
 * ADMIN-only: deleting destroys the record that a customer was expected at a
 * given time. RECEPCION cancels (estado CANCELADA) instead, which is reversible
 * and auditable. Same "structurally destructive => ADMIN-only" rule Fases 5 and
 * 6 applied to reportes and sedes.
 */
export async function deleteCitaAction(id: string): Promise<void> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const { count } = await tenantDb.cita.deleteMany({
    where: { id, ...scopeCita(session.user.sedeActivaId) },
  });
  if (count === 0) {
    throw new Error(NO_ENCONTRADA);
  }

  revalidarCitas();
}
