import type { requireRole } from "@/lib/auth/guards";
import type { getTenantDb } from "@/lib/db/tenant-client";

type Session = Awaited<ReturnType<typeof requireRole>>;
type TenantDb = ReturnType<typeof getTenantDb>;

/** RECEPCION siempre opera en su sede activa; ADMIN puede elegir otra. */
export function resolverSede(session: Session, pedida: string | undefined): string {
  if (session.user.role === "RECEPCION") return session.user.sedeActivaId;
  return pedida || session.user.sedeActivaId;
}

export async function validarSede(tenantDb: TenantDb, session: Session, sedeId: string): Promise<string | null> {
  if (sedeId === session.user.sedeActivaId) return null;
  const sede = await tenantDb.sede.findUnique({ where: { id: sedeId } });
  return sede ? null : "Sede no encontrada";
}

export async function validarCategoria(
  tenantDb: TenantDb,
  categoriaId: string,
  categoriaActual?: () => Promise<string | null>,
): Promise<string | null> {
  const categoria = await tenantDb.categoriaGasto.findUnique({ where: { id: categoriaId } });
  if (!categoria) return "La categoría no está disponible";
  if (categoria.activo) return null;
  // Editar permite conservar la categoría actual aunque se haya desactivado.
  if (categoriaActual && (await categoriaActual()) === categoriaId) return null;
  return "La categoría no está disponible";
}
