import { publicDb } from "@/lib/db/public-client";
import { getTenantDb } from "@/lib/db/tenant-client";

export interface BackfillConflict {
  email: string;
  existingTenantId: string;
  foundTenantId: string;
  foundTenantSlug: string;
}

export interface BackfillResult {
  inserted: number;
  alreadyCorrect: number;
  conflicts: BackfillConflict[];
}

/**
 * Fase 10 one-off migration: populates public.tenant_user_emails from every
 * existing tenant's Usuario table, so authorizeCredentials() can resolve a
 * tenant by email for users that already existed before this Fase. Never
 * overwrites an existing row -- if an email is already indexed under a
 * different tenant than the one it was just found in, it's reported as a
 * conflict instead (see scripts/check-duplicate-emails.ts, which should
 * report zero duplicates before this runs; a conflict here means new data
 * appeared between the audit and the backfill).
 */
export async function backfillTenantUserIndex(): Promise<BackfillResult> {
  const tenants = await publicDb.tenant.findMany({ select: { id: true, slug: true, schemaName: true } });

  const result: BackfillResult = { inserted: 0, alreadyCorrect: 0, conflicts: [] };

  for (const tenant of tenants) {
    const usuarios = await getTenantDb(tenant.schemaName).usuario.findMany({ select: { email: true } });
    for (const { email } of usuarios) {
      const existing = await publicDb.tenantUserEmail.findUnique({ where: { email } });
      if (!existing) {
        await publicDb.tenantUserEmail.create({ data: { email, tenantId: tenant.id } });
        result.inserted++;
      } else if (existing.tenantId === tenant.id) {
        result.alreadyCorrect++;
      } else {
        result.conflicts.push({
          email,
          existingTenantId: existing.tenantId,
          foundTenantId: tenant.id,
          foundTenantSlug: tenant.slug,
        });
      }
    }
  }

  return result;
}
