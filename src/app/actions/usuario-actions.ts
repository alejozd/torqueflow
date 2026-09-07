"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import bcrypt from "bcryptjs";
import { usuarioCreateInputSchema, usuarioUpdateInputSchema } from "@/lib/validation/usuario";
import { obtenerLimitesPlan } from "@/lib/planes/limites";
import {
  claimTenantUserEmail,
  releaseTenantUserEmail,
  TenantUserEmailConflictError,
} from "@/lib/tenant/tenant-user-email";
import type { Prisma } from "@/generated/prisma-tenant";

const EMAIL_EN_OTRO_TALLER = "Este correo ya está registrado en otro taller.";
const SEDE_INEXISTENTE = "Una de las sedes seleccionadas no existe.";

/** The checkbox list of every sede a Usuario may be assigned to. */
export interface SedeCheckboxOption {
  id: string;
  nombre: string;
}

export interface UsuarioConSedes {
  id: string;
  nombre: string;
  email: string;
  role: "ADMIN" | "TECNICO" | "RECEPCION";
  activo: boolean;
  sedeDefectoId: string | null;
  sedeIds: string[];
}

const USUARIO_CON_SEDES_SELECT = {
  id: true,
  nombre: true,
  email: true,
  role: true,
  activo: true,
  sedeDefectoId: true,
  sedes: { select: { sedeId: true } },
} as const;

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
    select: USUARIO_CON_SEDES_SELECT,
    orderBy: { nombre: "asc" },
  });

  return usuarios.map((usuario) => ({
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    role: usuario.role,
    activo: usuario.activo,
    sedeDefectoId: usuario.sedeDefectoId,
    sedeIds: usuario.sedes.map((asignacion) => asignacion.sedeId),
  }));
}

export interface UsuarioConMetricas {
  id: string;
  nombre: string;
  email: string;
  role: "ADMIN" | "TECNICO" | "RECEPCION";
  activo: boolean;
  sedeDefectoId: string | null;
  sedeIds: string[];
  ordenesActivas: number;
}

/**
 * Same directory as listUsuariosConSedes (ADMIN-only, no passwordHash) plus
 * "órdenes activas": how many OrdenTrabajo this usuario is the mecánico on
 * with estado not in ENTREGADA/ANULADA. A separate function instead of
 * extending listUsuariosConSedes -- that one is also read by
 * /usuarios/[id], which has no use for this count.
 */
export async function listUsuariosConMetricas(): Promise<UsuarioConMetricas[]> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const [usuarios, ordenesPorMecanico] = await Promise.all([
    tenantDb.usuario.findMany({
      select: USUARIO_CON_SEDES_SELECT,
      orderBy: { nombre: "asc" },
    }),
    tenantDb.ordenTrabajo.groupBy({
      by: ["mecanicoId"],
      where: { estado: { notIn: ["ENTREGADA", "ANULADA"] }, mecanicoId: { not: null } },
      _count: { mecanicoId: true },
    }),
  ]);

  const ordenesMap = new Map(
    ordenesPorMecanico
      .filter((fila): fila is typeof fila & { mecanicoId: string } => fila.mecanicoId !== null)
      .map((fila) => [fila.mecanicoId, fila._count.mecanicoId]),
  );

  return usuarios.map((usuario) => ({
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    role: usuario.role,
    activo: usuario.activo,
    sedeDefectoId: usuario.sedeDefectoId,
    sedeIds: usuario.sedes.map((asignacion) => asignacion.sedeId),
    ordenesActivas: ordenesMap.get(usuario.id) ?? 0,
  }));
}

export interface UsuarioFormState {
  error: string | null;
  success: boolean;
}

function parseUsuarioFormData(formData: FormData) {
  return {
    nombre: formData.get("nombre") ?? "",
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
    role: formData.get("role") ?? "",
    activo: formData.get("activo") ?? "",
    sedeIds: formData.getAll("sedeIds").map((value) => String(value)),
    sedeDefectoId: formData.get("sedeDefectoId") ?? "",
  };
}

export async function createUsuarioAction(
  prevState: UsuarioFormState,
  formData: FormData,
): Promise<UsuarioFormState> {
  const parsed = usuarioCreateInputSchema.safeParse(parseUsuarioFormData(formData));
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

  const sedeIds = [...new Set(parsed.data.sedeIds)];
  const sedeDefectoId = parsed.data.sedeDefectoId || null;
  const idsAVerificar = [...new Set([...sedeIds, ...(sedeDefectoId ? [sedeDefectoId] : [])])];
  if (idsAVerificar.length > 0) {
    const existentes = await tenantDb.sede.findMany({
      where: { id: { in: idsAVerificar } },
      select: { id: true },
    });
    if (existentes.length !== idsAVerificar.length) {
      return { error: SEDE_INEXISTENTE, success: false };
    }
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  let usuario: { id: string };
  try {
    // Sede assignment is nested in this same create call -- a single query,
    // atomic by construction, instead of a follow-up write that could leave
    // the Usuario row created with zero sedes on failure.
    usuario = await tenantDb.usuario.create({
      data: {
        nombre: parsed.data.nombre,
        email: parsed.data.email,
        passwordHash,
        role: parsed.data.role,
        activo: parsed.data.activo,
        sedeDefectoId,
        sedes: { create: sedeIds.map((sedeId) => ({ sedeId })) },
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al crear el usuario"), success: false };
  }

  try {
    await claimTenantUserEmail(session.user.tenantSchema, parsed.data.email);
  } catch (err) {
    // The public email->tenant index is what authorizeCredentials() trusts to
    // resolve a tenant by email (Fase 10) -- a Usuario this index can't reach
    // could never log in, so a claim conflict rolls back the just-created row
    // rather than leaving a permanently locked-out account.
    await tenantDb.usuario.delete({ where: { id: usuario.id } }).catch(() => {});
    if (err instanceof TenantUserEmailConflictError) {
      return { error: EMAIL_EN_OTRO_TALLER, success: false };
    }
    throw err;
  }

  revalidatePath("/usuarios");
  return { error: null, success: true };
}

export async function updateUsuarioAction(
  usuarioId: string,
  prevState: UsuarioFormState,
  formData: FormData,
): Promise<UsuarioFormState> {
  const parsed = usuarioUpdateInputSchema.safeParse(parseUsuarioFormData(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const usuarioActual = await tenantDb.usuario.findUnique({
    where: { id: usuarioId },
    select: { role: true, email: true },
  });
  if (!usuarioActual) {
    return { error: "Usuario no encontrado", success: false };
  }

  if (usuarioActual.role === "ADMIN") {
    if (parsed.data.role !== "ADMIN") {
      const totalAdmins = await tenantDb.usuario.count({ where: { role: "ADMIN" } });
      if (totalAdmins <= 1) {
        return {
          error: "No puedes quitar el rol de ADMIN al único administrador del taller.",
          success: false,
        };
      }
    }

    // Extends the same last-ADMIN protection to Estado: suspending (activo:
    // false) the only active ADMIN would lock the taller out of its own
    // admin capabilities just as surely as demoting them would.
    if (!parsed.data.activo) {
      const totalAdminsActivos = await tenantDb.usuario.count({ where: { role: "ADMIN", activo: true } });
      if (totalAdminsActivos <= 1) {
        return {
          error: "No puedes suspender al único administrador activo del taller.",
          success: false,
        };
      }
    }
  }

  const sedeIds = [...new Set(parsed.data.sedeIds)];
  const sedeDefectoId = parsed.data.sedeDefectoId || null;
  const idsAVerificar = [...new Set([...sedeIds, ...(sedeDefectoId ? [sedeDefectoId] : [])])];
  if (idsAVerificar.length > 0) {
    const existentes = await tenantDb.sede.findMany({
      where: { id: { in: idsAVerificar } },
      select: { id: true },
    });
    if (existentes.length !== idsAVerificar.length) {
      return { error: SEDE_INEXISTENTE, success: false };
    }
  }

  const datos: Prisma.UsuarioUncheckedUpdateInput = {
    nombre: parsed.data.nombre,
    email: parsed.data.email,
    role: parsed.data.role,
    activo: parsed.data.activo,
    sedeDefectoId,
    // Replaces the whole assignment set with whatever was submitted, nested
    // in this same update call -- deleteMany({}) matches every UsuarioSede
    // row for this usuario (implicit usuarioId filter), then create rebuilds
    // it from sedeIds, atomically as one query.
    sedes: { deleteMany: {}, create: sedeIds.map((sedeId) => ({ sedeId })) },
  };
  if (parsed.data.password) {
    datos.passwordHash = await bcrypt.hash(parsed.data.password, 12);
  }

  // Claiming the new email happens BEFORE writing to the tenant schema: a
  // conflict must never leave a usuario mid-update in tenantDb, and Usuario's
  // own @unique(email) already blocks a same-tenant collision.
  const emailCambio = usuarioActual.email !== parsed.data.email;
  if (emailCambio) {
    try {
      await claimTenantUserEmail(session.user.tenantSchema, parsed.data.email);
    } catch (err) {
      if (err instanceof TenantUserEmailConflictError) {
        return { error: EMAIL_EN_OTRO_TALLER, success: false };
      }
      throw err;
    }
  }

  try {
    await tenantDb.usuario.update({ where: { id: usuarioId }, data: datos });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al actualizar el usuario"), success: false };
  }

  if (emailCambio) {
    await releaseTenantUserEmail(usuarioActual.email);
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
    select: { role: true, email: true },
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

  await releaseTenantUserEmail(usuario.email);

  revalidatePath("/usuarios");
}
