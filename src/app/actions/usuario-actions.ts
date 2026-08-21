"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { usuarioSedesInputSchema } from "@/lib/validation/sede";

export interface UsuarioConSedes {
  id: string;
  nombre: string;
  email: string;
  role: "ADMIN" | "TECNICO" | "RECEPCION";
  sedeIds: string[];
}

export interface UsuarioSedesFormState {
  error: string | null;
  success: boolean;
}

/**
 * Read-only user directory plus their sede grants. ADMIN-only: a UsuarioSede
 * row is an authorization grant, so seeing and editing who has which one is
 * an admin capability.
 *
 * select-only, and passwordHash is deliberately absent -- this project has
 * shipped a whole-Usuario-row leak twice (Fase 2's listTecnicos, Fase 3's
 * listRepuestoOptions). Do not switch this to include.
 */
export async function listUsuariosConSedes(): Promise<UsuarioConSedes[]> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const usuarios = await tenantDb.usuario.findMany({
    select: {
      id: true,
      nombre: true,
      email: true,
      role: true,
      sedes: { select: { sedeId: true } },
    },
    orderBy: { nombre: "asc" },
  });

  return usuarios.map((usuario) => ({
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    role: usuario.role,
    sedeIds: usuario.sedes.map((asignacion) => asignacion.sedeId),
  }));
}

/**
 * Replaces the user's entire assignment set with whatever the checkbox group
 * submitted -- the only semantics that make a checkbox group honest. The
 * delete + createMany pair runs in one $transaction so a failure can never
 * leave the user with zero sedes (which, for a TECNICO/RECEPCION, means
 * locked out of login entirely).
 *
 * Every submitted id is verified to exist in this tenant before writing;
 * without that, the FK would reject it as an opaque Prisma error and the user
 * would see a stack-trace-flavoured message instead of Spanish.
 */
export async function setUsuarioSedesAction(
  usuarioId: string,
  prevState: UsuarioSedesFormState,
  formData: FormData,
): Promise<UsuarioSedesFormState> {
  const parsed = usuarioSedesInputSchema.safeParse({
    sedeIds: formData.getAll("sedeIds").map((value) => String(value)),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const sedeIds = [...new Set(parsed.data.sedeIds)];
  const existentes = await tenantDb.sede.findMany({
    where: { id: { in: sedeIds } },
    select: { id: true },
  });
  if (existentes.length !== sedeIds.length) {
    return { error: "Una de las sedes seleccionadas no existe.", success: false };
  }

  try {
    await tenantDb.$transaction([
      tenantDb.usuarioSede.deleteMany({ where: { usuarioId } }),
      tenantDb.usuarioSede.createMany({
        data: sedeIds.map((sedeId) => ({ usuarioId, sedeId })),
      }),
    ]);
  } catch (err) {
    return {
      error: friendlyPrismaErrorMessage(err, "Error al asignar las sedes"),
      success: false,
    };
  }

  revalidatePath("/usuarios");
  return { error: null, success: true };
}
