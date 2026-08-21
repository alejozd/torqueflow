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
