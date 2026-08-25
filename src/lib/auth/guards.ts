import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "@/auth";
import { getTenantBySchema } from "@/lib/tenant/resolve-tenant";

export type Role = "ADMIN" | "TECNICO" | "RECEPCION";

export async function requireSession(): Promise<Session> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  // Fase 10: there is no Host header to cross-check anymore -- tenantSchema
  // is fixed once, at login, from the email index. This re-check is only for
  // state that can change AFTER login: the tenant row disappearing (a
  // deleted tenant a stale session still points at) or being suspended.
  const tenant = await getTenantBySchema(session.user.tenantSchema);
  if (!tenant) {
    redirect("/login?error=tenant-mismatch");
  }
  if (tenant.estado === "SUSPENDIDO") {
    redirect("/login?error=tenant-suspendido");
  }

  // No sedeActivaId means login couldn't auto-resolve one (ADMIN with >1
  // sede, or TECNICO/RECEPCION with >1 assignment) -- sends the user to
  // complete their own session instead of scopeOrden/scopeBodega/etc.
  // silently dropping an undefined sede filter and exposing the whole
  // tenant.
  if (!session.user.sedeActivaId) {
    redirect("/seleccionar-sede");
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
