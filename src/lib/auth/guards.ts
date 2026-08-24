import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "@/auth";
import { resolveTenant } from "@/lib/tenant/resolve-tenant";

export type Role = "ADMIN" | "TECNICO" | "RECEPCION";

export async function requireSession(): Promise<Session> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const tenant = await resolveTenant();
  if (!tenant || tenant.schemaName !== session.user.tenantSchema) {
    redirect("/login?error=tenant-mismatch");
  }
  if (tenant.estado === "SUSPENDIDO") {
    redirect("/login?error=tenant-suspendido");
  }

  // A session minted before Fase 6 (or any token that somehow lost the
  // field) carries no sedeActivaId. Without this guard, scopeOrden/scopeBodega/
  // etc. would receive `undefined` and Prisma silently drops an undefined
  // field from a where clause -- every sede filter in the app would vanish
  // for that session, exposing the whole tenant instead of one sede. Forcing
  // a fresh login is what mints a token with a real sedeActivaId (Task 6).
  if (!session.user.sedeActivaId) {
    redirect("/login?error=sede-requerida");
  }

  return session;
}

export async function requireRole(allowed: Role[]): Promise<Session> {
  const session = await requireSession();
  if (!allowed.includes(session.user.role)) {
    redirect("/login?error=forbidden");
  }
  return session;
}
