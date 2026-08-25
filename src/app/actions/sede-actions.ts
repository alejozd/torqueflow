"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { sedeInputSchema } from "@/lib/validation/sede";
import { obtenerLimitesPlan } from "@/lib/planes/limites";
import type { Sede } from "@/generated/prisma-tenant";

export interface SedeFormState {
  error: string | null;
  success: boolean;
}

function parseSedeFormData(formData: FormData) {
  return sedeInputSchema.safeParse({
    nombre: formData.get("nombre") ?? "",
    direccion: formData.get("direccion") ?? "",
  });
}

/**
 * Sedes are the structural boundary that partitions the tenant's operational
 * data, and a UsuarioSede row is an authorization grant. Everything in this
 * module is therefore ADMIN-only -- deliberately stricter than bodega/proveedor
 * CRUD, which stay ["ADMIN", "RECEPCION"]. Same "structurally sensitive =>
 * ADMIN-only" rule Fase 5 applied to reportes.
 *
 * These reads are intentionally NOT sede-scoped: an ADMIN managing sedes must
 * see all of them, not just the one they happen to be logged into.
 */
export async function listSedes(): Promise<Sede[]> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.sede.findMany({ orderBy: { nombre: "asc" } });
}

export async function getSede(id: string): Promise<Sede | null> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.sede.findUnique({ where: { id } });
}

export async function createSedeAction(
  prevState: SedeFormState,
  formData: FormData,
): Promise<SedeFormState> {
  const parsed = parseSedeFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const { maxSedes } = await obtenerLimitesPlan(session.user.tenantSchema);
  if (maxSedes !== null) {
    const actuales = await tenantDb.sede.count();
    if (actuales >= maxSedes) {
      return {
        error: `Tu plan permite hasta ${maxSedes} sede(s). Actualiza tu plan para agregar más.`,
        success: false,
      };
    }
  }

  try {
    await tenantDb.sede.create({
      data: { nombre: parsed.data.nombre, direccion: parsed.data.direccion || null },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al crear la sede"), success: false };
  }

  revalidatePath("/sedes");
  return { error: null, success: true };
}

export async function updateSedeAction(
  id: string,
  prevState: SedeFormState,
  formData: FormData,
): Promise<SedeFormState> {
  const parsed = parseSedeFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    await tenantDb.sede.update({
      where: { id },
      data: { nombre: parsed.data.nombre, direccion: parsed.data.direccion || null },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al actualizar la sede"), success: false };
  }

  revalidatePath("/sedes");
  return { error: null, success: true };
}

/**
 * Pre-checks instead of letting the RESTRICT foreign keys surface as a raw
 * Prisma error: the three refusal reasons need three different Spanish
 * messages, and "last sede" is not a foreign key at all -- OrdenTrabajo.sedeId
 * and Bodega.sedeId are required, so a tenant with zero sedes can create
 * neither and nobody can log in.
 */
export async function deleteSedeAction(id: string): Promise<void> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const sede = await tenantDb.sede.findUnique({ where: { id }, select: { id: true } });
  if (!sede) {
    throw new Error("Sede no encontrada");
  }

  const totalSedes = await tenantDb.sede.count();
  if (totalSedes <= 1) {
    throw new Error("No puedes eliminar la única sede del taller.");
  }

  const [ordenes, bodegas] = await Promise.all([
    tenantDb.ordenTrabajo.count({ where: { sedeId: id } }),
    tenantDb.bodega.count({ where: { sedeId: id } }),
  ]);
  if (ordenes > 0 || bodegas > 0) {
    throw new Error("No puedes eliminar una sede con órdenes o bodegas asociadas.");
  }

  const asignados = await tenantDb.usuarioSede.count({ where: { sedeId: id } });
  if (asignados > 0) {
    throw new Error("No puedes eliminar una sede con usuarios asignados. Reasígnalos primero.");
  }

  try {
    await tenantDb.sede.delete({ where: { id } });
  } catch (err) {
    throw new Error(friendlyPrismaErrorMessage(err, "Error al eliminar la sede"));
  }

  revalidatePath("/sedes");
}

/**
 * `deleteSedeAction` throws on every refusal reason (tested directly via
 * `.rejects.toThrow` above) -- correct as a plain async function, but a
 * `<form action={deleteSedeAction.bind(null, id)}>` with no useActionState
 * has nothing to catch that throw, so a refused delete crashes to the
 * nearest error boundary instead of showing an inline message next to the
 * still-listed sede. This adapter is the useActionState-compatible wrapper
 * for that form; deleteSedeAction itself is unchanged.
 */
export async function deleteSedeFormAction(
  id: string,
  prevState: SedeFormState,
): Promise<SedeFormState> {
  try {
    await deleteSedeAction(id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al eliminar la sede", success: false };
  }
  return { error: null, success: true };
}
