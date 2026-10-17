import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "@/auth";
import { getTenantBySchema } from "@/lib/tenant/resolve-tenant";
import { getTenantDb } from "@/lib/db/tenant-client";

import { permisosEfectivos, tienePermiso, type Permiso, type Role } from "@/lib/auth/permisos";
export type { Role };

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

  // Same tradeoff as the tenant check above: a deliberate extra query per
  // guarded request, so a user suspended mid-session (activo:false) is
  // kicked out on their very next request instead of waiting for a stale JWT
  // to expire.
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const usuario = await tenantDb.usuario.findUnique({
    where: { id: session.user.id },
    select: { activo: true, role: true },
  });
  if (!usuario || !usuario.activo) {
    redirect("/login?error=usuario-suspendido");
  }
  // D4: el rol (y desde la tarea 13 las excepciones) se leen aquí en cada
  // petición, en la consulta que ya existía para `activo`: un cambio de
  // permisos aplica en la siguiente acción, sin esperar a que venza el JWT.
  session.user.role = usuario.role;
  session.user.permisos = permisosEfectivos({ role: usuario.role });

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

export function puede(session: Session, permiso: Permiso): boolean {
  return tienePermiso(session.user.permisos, permiso);
}

export async function requirePermiso(permiso: Permiso): Promise<Session> {
  const session = await requireSession();
  if (!puede(session, permiso)) {
    redirect("/sin-permiso");
  }
  return session;
}
