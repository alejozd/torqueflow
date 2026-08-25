"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { usuarioSedesInputSchema } from "@/lib/validation/sede";
import bcrypt from "bcryptjs";
import { usuarioCreateInputSchema, usuarioUpdateInputSchema } from "@/lib/validation/usuario";
import { obtenerLimitesPlan } from "@/lib/planes/limites";
import type { Prisma } from "@/generated/prisma-tenant";

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

export interface UsuarioFormState {
  error: string | null;
  success: boolean;
}

export async function createUsuarioAction(
  prevState: UsuarioFormState,
  formData: FormData,
): Promise<UsuarioFormState> {
  const parsed = usuarioCreateInputSchema.safeParse({
    nombre: formData.get("nombre") ?? "",
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
    role: formData.get("role") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const { maxUsuarios } = await obtenerLimitesPlan(session.user.tenantSchema);
  if (maxUsuarios !== null) {
    const actuales = await tenantDb.usuario.count();
    if (actuales >= maxUsuarios) {
      return {
        error: `Tu plan permite hasta ${maxUsuarios} usuario(s). Actualiza tu plan para agregar más.`,
        success: false,
      };
    }
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  try {
    const usuario = await tenantDb.usuario.create({
      data: {
        nombre: parsed.data.nombre,
        email: parsed.data.email,
        passwordHash,
        role: parsed.data.role,
      },
    });

    // Day-one login: a TECNICO/RECEPCION with no UsuarioSede row cannot pass
    // the sede gate in authorizeCredentials, so every created user is granted
    // the tenant's oldest sede -- the same day-one grant seedTenantUser makes.
    // Without this, a freshly created user's login fails with the deliberately
    // uniform "credenciales incorrectas" message, indistinguishable from a
    // wrong password and impossible for the ADMIN to diagnose.
    const sede = await tenantDb.sede.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
    if (sede) {
      await tenantDb.usuarioSede.create({ data: { usuarioId: usuario.id, sedeId: sede.id } });
    }
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al crear el usuario"), success: false };
  }

  revalidatePath("/usuarios");
  return { error: null, success: true };
}

export async function updateUsuarioAction(
  usuarioId: string,
  prevState: UsuarioFormState,
  formData: FormData,
): Promise<UsuarioFormState> {
  const parsed = usuarioUpdateInputSchema.safeParse({
    nombre: formData.get("nombre") ?? "",
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
    role: formData.get("role") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  if (parsed.data.role !== "ADMIN") {
    const usuarioActual = await tenantDb.usuario.findUnique({
      where: { id: usuarioId },
      select: { role: true },
    });
    if (usuarioActual?.role === "ADMIN") {
      const totalAdmins = await tenantDb.usuario.count({ where: { role: "ADMIN" } });
      if (totalAdmins <= 1) {
        return {
          error: "No puedes quitar el rol de ADMIN al único administrador del taller.",
          success: false,
        };
      }
    }
  }

  const datos: Prisma.UsuarioUpdateInput = {
    nombre: parsed.data.nombre,
    email: parsed.data.email,
    role: parsed.data.role,
  };
  if (parsed.data.password) {
    datos.passwordHash = await bcrypt.hash(parsed.data.password, 12);
  }

  try {
    await tenantDb.usuario.update({ where: { id: usuarioId }, data: datos });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al actualizar el usuario"), success: false };
  }

  revalidatePath("/usuarios");
  return { error: null, success: true };
}

/**
 * Does NOT pre-check every one of Usuario's eight onDelete:Restrict
 * relations (órdenes, DVIs, facturas, pagos, historial, entradas, citas,
 * mecánico) -- friendlyPrismaErrorMessage's existing P2003 branch already
 * gives one honest, generic Spanish message for all of them. Only the
 * last-ADMIN rule gets its own check, because it is not a foreign key.
 */
export async function deleteUsuarioAction(usuarioId: string): Promise<void> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const usuario = await tenantDb.usuario.findUnique({
    where: { id: usuarioId },
    select: { role: true },
  });
  if (!usuario) {
    throw new Error("Usuario no encontrado");
  }

  if (usuario.role === "ADMIN") {
    const totalAdmins = await tenantDb.usuario.count({ where: { role: "ADMIN" } });
    if (totalAdmins <= 1) {
      throw new Error("No puedes eliminar al único administrador del taller.");
    }
  }

  try {
    await tenantDb.usuario.delete({ where: { id: usuarioId } });
  } catch (err) {
    throw new Error(friendlyPrismaErrorMessage(err, "Error al eliminar el usuario"));
  }

  revalidatePath("/usuarios");
}
