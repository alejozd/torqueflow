import { publicDb } from "@/lib/db/public-client";

export interface ResolvedTenant {
  slug: string;
  schemaName: string;
  estado: "ACTIVO" | "SUSPENDIDO";
}

/**
 * Fase 10: looks up a tenant by the schemaName already fixed in the
 * session (not by any Host-derived slug) -- what guards.ts uses to re-check
 * a tenant hasn't been suspended or deleted since login, on every request.
 */
export async function getTenantBySchema(schemaName: string): Promise<ResolvedTenant | null> {
  const tenant = await publicDb.tenant.findUnique({ where: { schemaName } });
  if (!tenant) return null;

  return { slug: tenant.slug, schemaName: tenant.schemaName, estado: tenant.estado };
}
