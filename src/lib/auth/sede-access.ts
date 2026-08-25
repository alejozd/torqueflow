import type { TenantPrismaClient } from "@/lib/db/tenant-client";
import type { Role } from "@/lib/auth/guards";

export interface SedeActiva {
  id: string;
  nombre: string;
}

/**
 * Decides whether `usuarioId` may work in `sedeId`, and returns the sede's
 * id + nombre so the caller can put both in the session (the nombre is what
 * the dashboard header renders, avoiding a query on every page).
 *
 * ADMIN bypasses UsuarioSede entirely -- that is the design doc's own rule
 * (§5 módulo 12: "el admin del taller ve todas"). It is a bypass of the
 * *assignment* check only: the sede must still exist in this tenant, and once
 * chosen it scopes the ADMIN's queries exactly like anyone else's.
 *
 * Returns null for every failure mode -- unknown sede, no assignment, empty
 * input -- so the caller cannot accidentally distinguish them and leak whether
 * a given sede exists or who is assigned where.
 */
export async function resolveSedeActiva(
  tenantDb: TenantPrismaClient,
  usuarioId: string,
  role: Role,
  sedeId: string,
): Promise<SedeActiva | null> {
  if (!sedeId) return null;

  const sede = await tenantDb.sede.findUnique({
    where: { id: sedeId },
    select: { id: true, nombre: true },
  });
  if (!sede) return null;

  if (role === "ADMIN") {
    return { id: sede.id, nombre: sede.nombre };
  }

  const asignacion = await tenantDb.usuarioSede.findUnique({
    where: { usuarioId_sedeId: { usuarioId, sedeId } },
    select: { sedeId: true },
  });
  if (!asignacion) return null;

  return { id: sede.id, nombre: sede.nombre };
}

/**
 * Fase 10: with no pre-login sede dropdown, login only auto-picks a sede
 * when there is exactly one unambiguous candidate -- an ADMIN's candidates
 * are every sede in the tenant (same bypass rule as resolveSedeActiva), a
 * TECNICO/RECEPCION's are only their UsuarioSede assignments. Returns null
 * for zero or multiple candidates; the caller (authorizeCredentials) then
 * leaves sedeActivaId unset so the session is completed later at
 * /seleccionar-sede.
 */
export async function resolveSedeInicial(
  tenantDb: TenantPrismaClient,
  usuarioId: string,
  role: Role,
): Promise<SedeActiva | null> {
  const sedes =
    role === "ADMIN"
      ? await tenantDb.sede.findMany({ select: { id: true, nombre: true } })
      : (
          await tenantDb.usuarioSede.findMany({
            where: { usuarioId },
            select: { sede: { select: { id: true, nombre: true } } },
          })
        ).map((asignacion) => asignacion.sede);

  return sedes.length === 1 ? sedes[0] : null;
}
