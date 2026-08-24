"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/super-admin/guards";
import { publicDb } from "@/lib/db/public-client";
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
