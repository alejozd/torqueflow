import { publicDb } from "@/lib/db/public-client";

export class TenantUserEmailConflictError extends Error {
  constructor(email: string) {
    super(`Email "${email}" is already registered under a different tenant.`);
    this.name = "TenantUserEmailConflictError";
  }
}

/**
 * Registers `email` as belonging to the tenant identified by `schemaName` in
 * the global public.tenant_user_emails index (Fase 10) -- the source of
 * truth authorizeCredentials() uses to resolve a tenant by email. Idempotent
 * for the same tenant; throws TenantUserEmailConflictError without touching
 * the row if the email is already claimed by a DIFFERENT tenant, so a typo
 * or a stale form can never silently hand one tenant's login identity to
 * another.
 */
export async function claimTenantUserEmail(schemaName: string, email: string): Promise<void> {
  const tenant = await publicDb.tenant.findUniqueOrThrow({ where: { schemaName }, select: { id: true } });

  const existing = await publicDb.tenantUserEmail.findUnique({ where: { email } });
  if (existing && existing.tenantId !== tenant.id) {
    throw new TenantUserEmailConflictError(email);
  }
  if (!existing) {
    await publicDb.tenantUserEmail.create({ data: { email, tenantId: tenant.id } });
  }
}

/** Removes `email` from the index. A no-op if it has no mapping. */
export async function releaseTenantUserEmail(email: string): Promise<void> {
  await publicDb.tenantUserEmail.deleteMany({ where: { email } });
}
