import { resolveTenant } from "@/lib/tenant/resolve-tenant";
import { getTenantDb } from "@/lib/db/tenant-client";
import { verifyCredentials } from "@/lib/auth/verify-credentials";
import { resolveSedeActiva } from "@/lib/auth/sede-access";

export interface AuthorizedUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "TECNICO" | "RECEPCION";
  tenantSlug: string;
  tenantSchema: string;
  sedeActivaId: string;
  sedeActivaNombre: string;
}

/**
 * The tenant is already fixed by the subdomain before this runs (Edge
 * middleware, Fase 1), so resolveTenant() here is not the forbidden
 * re-derivation pattern -- there is no session yet to derive anything from.
 *
 * Order matters: credentials are verified BEFORE the sede is resolved, so a
 * failed password never performs a sede lookup and cannot be used to probe
 * which sedes exist. Every failure path returns null, and the login form
 * renders one uniform message for all of them.
 */
export async function authorizeCredentials(
  credentials: Record<string, unknown> | undefined,
): Promise<AuthorizedUser | null> {
  const email = credentials?.email;
  const password = credentials?.password;
  const sedeId = credentials?.sedeId;
  if (typeof email !== "string" || typeof password !== "string" || typeof sedeId !== "string") {
    return null;
  }
  if (!sedeId) return null;

  const tenant = await resolveTenant();
  if (!tenant) return null;

  const tenantDb = getTenantDb(tenant.schemaName);
  const usuario = await verifyCredentials(tenantDb, email, password);
  if (!usuario) return null;

  const sedeActiva = await resolveSedeActiva(tenantDb, usuario.id, usuario.role, sedeId);
  if (!sedeActiva) return null;

  return {
    id: usuario.id,
    email: usuario.email,
    name: usuario.nombre,
    role: usuario.role,
    tenantSlug: tenant.slug,
    tenantSchema: tenant.schemaName,
    sedeActivaId: sedeActiva.id,
    sedeActivaNombre: sedeActiva.nombre,
  };
}
