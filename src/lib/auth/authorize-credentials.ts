import { publicDb } from "@/lib/db/public-client";
import { getTenantDb } from "@/lib/db/tenant-client";
import { verifyCredentials } from "@/lib/auth/verify-credentials";
import { resolveSedeInicial } from "@/lib/auth/sede-access";

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
 * Fase 10: there is only one URL now, so the tenant is resolved from the
 * EMAIL itself via public.tenant_user_emails -- not from a subdomain/Host
 * header. This is still the point where the tenant gets fixed for the
 * session, same as before.
 *
 * Order matters: the email->tenant lookup and password check both run
 * BEFORE any sede logic, so a wrong password never performs a sede lookup.
 * Every failure path returns null, one uniform message for the login form.
 *
 * sedeActivaId/sedeActivaNombre come back as "" (not undefined) when no
 * sede can be auto-resolved (zero or more than one candidate) -- guards.ts's
 * `!session.user.sedeActivaId` check already treats an empty string as "no
 * sede", and the session gets completed later at /seleccionar-sede.
 */
export async function authorizeCredentials(
  credentials: Record<string, unknown> | undefined,
): Promise<AuthorizedUser | null> {
  const email = credentials?.email;
  const password = credentials?.password;
  if (typeof email !== "string" || typeof password !== "string") {
    return null;
  }

  const indexado = await publicDb.tenantUserEmail.findUnique({
    where: { email },
    include: { tenant: true },
  });
  if (!indexado) return null;

  const tenant = indexado.tenant;
  // A suspended tenant fails the same way a wrong password does -- no
  // distinct message, consistent with this login flow already treating wrong
  // password/unknown email/suspended tenant as indistinguishable.
  if (tenant.estado === "SUSPENDIDO") return null;

  const tenantDb = getTenantDb(tenant.schemaName);
  const usuario = await verifyCredentials(tenantDb, email, password);
  if (!usuario) return null;

  const sedeActiva = await resolveSedeInicial(tenantDb, usuario.id, usuario.role);

  return {
    id: usuario.id,
    email: usuario.email,
    name: usuario.nombre,
    role: usuario.role,
    tenantSlug: tenant.slug,
    tenantSchema: tenant.schemaName,
    sedeActivaId: sedeActiva?.id ?? "",
    sedeActivaNombre: sedeActiva?.nombre ?? "",
  };
}
