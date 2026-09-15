"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/super-admin/guards";
import { publicDb } from "@/lib/db/public-client";
import { getTenantDb } from "@/lib/db/tenant-client";
import { provisionTenant } from "../../../scripts/provision-tenant";
import { seedTenantUser } from "../../../scripts/seed-tenant-user";
import { TenantUserEmailConflictError } from "@/lib/tenant/tenant-user-email";
import { registrarEventoAuditoriaPlataforma } from "@/lib/auditoria/registrarEventoPlataforma";
import type { AuditLogConActor } from "@/app/actions/auditoria-actions";
import type { Plan, Prisma, TipoEventoAuditoriaPlataforma } from "@/generated/prisma-public";

export interface SuperAdminFormState {
  error: string | null;
  success: boolean;
}

const TENANT_CON_PLAN_INCLUDE = { plan: true } satisfies Prisma.TenantInclude;
export type TenantConPlan = Prisma.TenantGetPayload<{ include: typeof TENANT_CON_PLAN_INCLUDE }>;

export async function listTenantsConPlan(): Promise<TenantConPlan[]> {
  await requireSuperAdmin();
  return publicDb.tenant.findMany({ include: TENANT_CON_PLAN_INCLUDE, orderBy: { slug: "asc" } });
}

export async function listPlanes(): Promise<Plan[]> {
  await requireSuperAdmin();
  return publicDb.plan.findMany({ orderBy: { nombre: "asc" } });
}

export async function cambiarEstadoTenantAction(
  tenantId: string,
  prevState: SuperAdminFormState,
  formData: FormData,
): Promise<SuperAdminFormState> {
  const estado = formData.get("estado");
  if (estado !== "ACTIVO" && estado !== "SUSPENDIDO") {
    return { error: "Estado inválido", success: false };
  }

  const superAdmin = await requireSuperAdmin();

  const tenantActual = await publicDb.tenant.findUnique({ where: { id: tenantId }, select: { estado: true } });

  await publicDb.$transaction(async (tx) => {
    await tx.tenant.update({ where: { id: tenantId }, data: { estado } });
    // Solo el evento es condicional (el update es idempotente): mismo patrón
    // que los eventos con scope de tenant -- un evento sin cambio real haría
    // creer que algo cambió cuando se reenvió el mismo estado.
    if (tenantActual && tenantActual.estado !== estado) {
      await registrarEventoAuditoriaPlataforma(tx, {
        tipo: "TENANT_CAMBIAR_ESTADO",
        superAdminId: superAdmin.id,
        tenantId,
        detalle: { estadoAnterior: tenantActual.estado, estadoNuevo: estado },
      });
    }
  });

  revalidatePath("/superadmin");
  return { error: null, success: true };
}

export async function cambiarPlanTenantAction(
  tenantId: string,
  prevState: SuperAdminFormState,
  formData: FormData,
): Promise<SuperAdminFormState> {
  const planId = String(formData.get("planId") ?? "");
  if (!planId) {
    return { error: "Selecciona un plan", success: false };
  }

  const superAdmin = await requireSuperAdmin();

  const tenantActual = await publicDb.tenant.findUnique({ where: { id: tenantId }, select: { planId: true } });

  await publicDb.$transaction(async (tx) => {
    await tx.tenant.update({ where: { id: tenantId }, data: { planId } });
    // Solo el evento es condicional (el update es idempotente): mismo patrón
    // que los eventos con scope de tenant -- un evento sin cambio real haría
    // creer que algo cambió cuando se reenvió el mismo plan.
    if (tenantActual && tenantActual.planId !== planId) {
      await registrarEventoAuditoriaPlataforma(tx, {
        tipo: "TENANT_CAMBIAR_PLAN",
        superAdminId: superAdmin.id,
        tenantId,
        detalle: { planIdAnterior: tenantActual.planId, planIdNuevo: planId },
      });
    }
  });

  revalidatePath("/superadmin");
  return { error: null, success: true };
}

export interface CrearTenantResult {
  error: string | null;
  credenciales: { email: string; password: string } | null;
}

const ERRORES_PROVISIONAMIENTO_CONOCIDOS = /Invalid slug|Invalid schema name|already exists/;

/**
 * Compensating rollback for a tenant left orphaned after provisionTenant()
 * succeeded but a later step (seedTenantUser, the audit write) failed: deletes
 * the Tenant row and drops its schema. Both calls individually swallow their
 * own failure -- best-effort cleanup, never masks the original error.
 */
async function rollbackTenantProvisioning(tenantId: string, schemaName: string): Promise<void> {
  await publicDb.tenant.delete({ where: { id: tenantId } }).catch(() => {});
  await publicDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`).catch(() => {});
}

export async function crearTenantAction(
  prevState: CrearTenantResult,
  formData: FormData,
): Promise<CrearTenantResult> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const planId = String(formData.get("planId") ?? "");
  const adminEmail = String(formData.get("adminEmail") ?? "").trim();
  const adminNombre = String(formData.get("adminNombre") ?? "").trim();

  if (!nombre) return { error: "El nombre del tenant es obligatorio", credenciales: null };
  if (!slug) return { error: "El slug es obligatorio", credenciales: null };
  if (!planId) return { error: "Selecciona un plan", credenciales: null };
  if (!adminEmail) return { error: "El correo del administrador es obligatorio", credenciales: null };
  if (!adminNombre) return { error: "El nombre del administrador es obligatorio", credenciales: null };

  const superAdmin = await requireSuperAdmin();

  const schemaName = slug.replace(/-/g, "_");
  // 9 raw bytes -> exactly 12 base64url characters (no padding), safe alphabet.
  const password = randomBytes(9).toString("base64url");

  let tenant: { id: string };
  try {
    tenant = await provisionTenant({ slug, schemaName, planId, nombre });
  } catch (err) {
    console.error(err);
    const mensaje = err instanceof Error ? err.message : "";
    return {
      error: ERRORES_PROVISIONAMIENTO_CONOCIDOS.test(mensaje)
        ? mensaje
        : "No se pudo crear el tenant, contactá soporte",
      credenciales: null,
    };
  }

  try {
    await seedTenantUser({ schemaName, email: adminEmail, password, nombre: adminNombre });
  } catch (err) {
    // seedTenantUser failed AFTER provisionTenant succeeded: the tenant would
    // otherwise be orphaned (schema + row, but no admin able to log in).
    await rollbackTenantProvisioning(tenant.id, schemaName);

    if (err instanceof TenantUserEmailConflictError) {
      return { error: "Este correo ya está registrado en otro taller.", credenciales: null };
    }
    console.error(err);
    return { error: "No se pudo crear el usuario administrador, contactá soporte", credenciales: null };
  }

  try {
    // provisionTenant/seedTenantUser no están envueltos en una única
    // transacción de Prisma -- crear el schema del tenant es DDL fuera del
    // control de Prisma. Si el registro de auditoría falla aquí, se aplica
    // el mismo rollback compensatorio que la rama de arriba: un tenant que
    // existe pero nunca quedó auditado es peor que uno que nunca se creó.
    await registrarEventoAuditoriaPlataforma(publicDb, {
      tipo: "TENANT_CREAR",
      superAdminId: superAdmin.id,
      tenantId: tenant.id,
      detalle: { slug, nombre, planId, adminEmail },
    });
  } catch (err) {
    await rollbackTenantProvisioning(tenant.id, schemaName);
    console.error(err);
    return { error: "No se pudo registrar la auditoría del tenant, contactá soporte", credenciales: null };
  }

  revalidatePath("/superadmin");
  return { error: null, credenciales: { email: adminEmail, password } };
}

export interface ConteoUsuariosGlobal {
  total: number;
  nuevosUltimoMes: number;
}

/**
 * Usuario lives per-tenant schema, not in `public` -- so this is the only way
 * to get a platform-wide headcount: open every tenant's own Prisma client and
 * sum. Fine at the current tenant count; revisit if this ever needs to scale
 * past dozens of tenants (e.g. a materialized counter updated on create).
 */
export async function contarUsuariosGlobal(): Promise<ConteoUsuariosGlobal> {
  await requireSuperAdmin();

  const tenants = await publicDb.tenant.findMany({ select: { schemaName: true } });
  const haceUnMes = new Date();
  haceUnMes.setDate(haceUnMes.getDate() - 30);

  let total = 0;
  let nuevosUltimoMes = 0;
  for (const tenant of tenants) {
    const tenantDb = getTenantDb(tenant.schemaName);
    const [countTotal, countNuevos] = await Promise.all([
      tenantDb.usuario.count(),
      tenantDb.usuario.count({ where: { createdAt: { gte: haceUnMes } } }),
    ]);
    total += countTotal;
    nuevosUltimoMes += countNuevos;
  }

  return { total, nuevosUltimoMes };
}

export interface AuditLogPlataformaConSuperAdmin {
  id: string;
  tipo: TipoEventoAuditoriaPlataforma;
  superAdminNombre: string | null;
  tenantSlug: string | null;
  detalle: unknown;
  createdAt: Date;
}

export async function listAuditLogPlataforma(): Promise<AuditLogPlataformaConSuperAdmin[]> {
  await requireSuperAdmin();

  const eventos = await publicDb.auditLogPlataforma.findMany({
    include: { superAdmin: { select: { nombre: true } }, tenant: { select: { slug: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return eventos.map((evento) => ({
    id: evento.id,
    tipo: evento.tipo,
    superAdminNombre: evento.superAdmin?.nombre ?? null,
    tenantSlug: evento.tenant?.slug ?? null,
    detalle: evento.detalle,
    createdAt: evento.createdAt,
  }));
}

export interface AuditLogTenantResultado {
  tenant: { slug: string; nombre: string | null };
  eventos: AuditLogConActor[];
}

/** El super-admin "itera tenants" para ver su auditoría (spec §1, modelo de
 * datos): AuditLog vive en el schema de cada tenant, no en public, así que
 * esta lectura resuelve el schema primero y abre ese Prisma client. */
export async function listAuditLogTenant(tenantId: string): Promise<AuditLogTenantResultado | null> {
  await requireSuperAdmin();

  const tenant = await publicDb.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true, nombre: true, schemaName: true },
  });
  if (!tenant) return null;

  const tenantDb = getTenantDb(tenant.schemaName);
  const eventos = await tenantDb.auditLog.findMany({
    include: { actor: { select: { nombre: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return {
    tenant: { slug: tenant.slug, nombre: tenant.nombre },
    eventos: eventos.map((evento) => ({
      id: evento.id,
      tipo: evento.tipo,
      actorNombre: evento.actor?.nombre ?? null,
      entidadTipo: evento.entidadTipo,
      entidadId: evento.entidadId,
      detalle: evento.detalle,
      createdAt: evento.createdAt,
    })),
  };
}
