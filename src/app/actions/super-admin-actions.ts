"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/super-admin/guards";
import { publicDb } from "@/lib/db/public-client";
import { provisionTenant } from "../../../scripts/provision-tenant";
import { seedTenantUser } from "../../../scripts/seed-tenant-user";
import { TenantUserEmailConflictError } from "@/lib/tenant/tenant-user-email";
import type { Plan, Prisma } from "@/generated/prisma-public";

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

  await requireSuperAdmin();

  await publicDb.tenant.update({ where: { id: tenantId }, data: { estado } });

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

  await requireSuperAdmin();

  await publicDb.tenant.update({ where: { id: tenantId }, data: { planId } });

  revalidatePath("/superadmin");
  return { error: null, success: true };
}

export interface CrearTenantResult {
  error: string | null;
  credenciales: { email: string; password: string } | null;
}

const ERRORES_PROVISIONAMIENTO_CONOCIDOS = /Invalid slug|Invalid schema name|already exists/;

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

  await requireSuperAdmin();

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
    await publicDb.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
    await publicDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`).catch(() => {});

    if (err instanceof TenantUserEmailConflictError) {
      return { error: "Este correo ya está registrado en otro taller.", credenciales: null };
    }
    console.error(err);
    return { error: "No se pudo crear el usuario administrador, contactá soporte", credenciales: null };
  }

  revalidatePath("/superadmin");
  return { error: null, credenciales: { email: adminEmail, password } };
}
