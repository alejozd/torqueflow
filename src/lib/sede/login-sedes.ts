import { resolveTenant } from "@/lib/tenant/resolve-tenant";
import { getTenantDb } from "@/lib/db/tenant-client";

export interface SedeOption {
  id: string;
  nombre: string;
}

/**
 * The only sede read in the app that runs without a session: the login page
 * needs the sede <select> populated before anyone has authenticated. The
 * tenant is already pinned by the subdomain (Edge middleware, Fase 1), so this
 * can never list another taller's sedes.
 *
 * Accepted, deliberate tradeoff: this discloses sede NAMES to an
 * unauthenticated visitor of the subdomain. They are branch labels, not
 * secrets, and the visitor already learns the taller exists from the subdomain
 * resolving at all. It buys a one-step login instead of a bespoke two-step
 * half-authenticated flow. See the plan's Global Constraints.
 *
 * select-only: never hand a whole Sede row to a public page.
 */
export async function listSedesDelTenant(): Promise<SedeOption[]> {
  const tenant = await resolveTenant();
  if (!tenant) return [];

  const tenantDb = getTenantDb(tenant.schemaName);
  return tenantDb.sede.findMany({
    select: { id: true, nombre: true },
    orderBy: { nombre: "asc" },
  });
}
