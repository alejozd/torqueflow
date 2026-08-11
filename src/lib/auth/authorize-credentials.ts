import { resolveTenant } from "@/lib/tenant/resolve-tenant";
import { getTenantDb } from "@/lib/db/tenant-client";
import { verifyCredentials } from "@/lib/auth/verify-credentials";

export interface AuthorizedUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "TECNICO" | "RECEPCION";
  tenantSlug: string;
  tenantSchema: string;
}

export async function authorizeCredentials(
  credentials: Record<string, unknown> | undefined,
): Promise<AuthorizedUser | null> {
  const email = credentials?.email;
  const password = credentials?.password;
  if (typeof email !== "string" || typeof password !== "string") {
    return null;
  }

  const tenant = await resolveTenant();
  if (!tenant) return null;

  const tenantDb = getTenantDb(tenant.schemaName);
  const usuario = await verifyCredentials(tenantDb, email, password);
  if (!usuario) return null;

  return {
    id: usuario.id,
    email: usuario.email,
    name: usuario.nombre,
    role: usuario.role,
    tenantSlug: tenant.slug,
    tenantSchema: tenant.schemaName,
  };
}
