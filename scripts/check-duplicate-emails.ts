import { publicDb } from "@/lib/db/public-client";
import { getTenantDb } from "@/lib/db/tenant-client";

export interface DuplicateEmail {
  email: string;
  tenantSlugs: string[];
}

/**
 * Fase 10 read-only audit: the new public.tenant_user_emails index requires
 * email to be unique across ALL tenants, but Usuario.email today is only
 * unique per tenant schema. Must return [] before the Fase 10 migration runs.
 */
export async function checkDuplicateEmails(): Promise<DuplicateEmail[]> {
  const tenants = await publicDb.tenant.findMany({ select: { slug: true, schemaName: true } });

  const emailToSlugs = new Map<string, string[]>();
  for (const tenant of tenants) {
    const usuarios = await getTenantDb(tenant.schemaName).usuario.findMany({ select: { email: true } });
    for (const { email } of usuarios) {
      const slugs = emailToSlugs.get(email) ?? [];
      slugs.push(tenant.slug);
      emailToSlugs.set(email, slugs);
    }
  }

  return Array.from(emailToSlugs.entries())
    .filter(([, slugs]) => slugs.length > 1)
    .map(([email, tenantSlugs]) => ({ email, tenantSlugs }));
}
