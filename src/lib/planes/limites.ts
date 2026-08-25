import { publicDb } from "@/lib/db/public-client";

export interface LimitesPlan {
  maxUsuarios: number | null;
  maxSedes: number | null;
}

/**
 * The only function that reads publicDb for plan data. Prisma cannot span
 * the public/tenant schema split (see Fase 1), so this is a plain two-hop
 * lookup: publicDb.tenant -> its Plan -> the two numeric limits. `null`
 * means "sin límite práctico" (Avanzado), never a sentinel like -1.
 *
 * tenantSchema is guaranteed to resolve to a live Tenant+Plan for any caller
 * that reached this via requireRole()/requireSession() -- that already
 * re-checked the tenant exists (getTenantBySchema()) before returning the
 * session, and Tenant.planId is a required FK. A missing row here would
 * mean the session's own tenant vanished mid-request, not a normal input to
 * validate.
 */
export async function obtenerLimitesPlan(tenantSchema: string): Promise<LimitesPlan> {
  const tenant = await publicDb.tenant.findUnique({
    where: { schemaName: tenantSchema },
    select: { plan: { select: { maxUsuarios: true, maxSedes: true } } },
  });
  return tenant!.plan;
}
