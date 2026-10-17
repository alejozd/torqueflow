import { puede, type requireSession } from "@/lib/auth/guards";
import type { getTenantDb } from "@/lib/db/tenant-client";

type Session = Awaited<ReturnType<typeof requireSession>>;
type TenantDb = ReturnType<typeof getTenantDb>;

/** Quien no puede trabajar con todas las sedes opera en su sede activa; el resto puede elegir otra. */
export function resolverSede(session: Session, pedida: string | undefined): string {
  if (!puede(session, "sedes.verTodas")) return session.user.sedeActivaId;
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
  categoriaActual?: string | null | (() => Promise<string | null>),
): Promise<string | null> {
  const categoria = await tenantDb.categoriaGasto.findUnique({ where: { id: categoriaId } });
  if (!categoria) return "La categoría no está disponible";
  if (categoria.activo) return null;
  // Editar permite conservar la categoría actual aunque se haya desactivado.
  if (categoriaActual) {
    const actual = typeof categoriaActual === "function" ? await categoriaActual() : categoriaActual;
    if (actual === categoriaId) return null;
  }
  return "La categoría no está disponible";
}
