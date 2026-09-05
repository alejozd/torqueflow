// Pure, server/auth-free helpers for SuperAdminPage's table rendering.
// Kept out of page.tsx so tests can import them without pulling in
// requireSuperAdmin's NextAuth import chain.

/** "taller-dev" -> "TD"; una sola palabra -> sus dos primeras letras. */
export function inicialesDeSlug(slug: string): string {
  const partes = slug.split("-").filter(Boolean);
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase();
  return (partes[0]!.charAt(0) + partes[1]!.charAt(0)).toUpperCase();
}

// Paleta corta ya usada en esta página (ámbar/azul/verde/rojo/neutro) --
// asignación puramente visual, determinística por id, sin significado.
const AVATAR_PALETTE = [
  "bg-amber-100 text-amber-800",
  "bg-blue-100 text-blue-800",
  "bg-green-100 text-green-800",
  "bg-red-100 text-red-800",
  "bg-muted text-foreground",
];

export function colorAvatarPorId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]!;
}

export function limiteSedesLabel(maxSedes: number | null): string {
  if (maxSedes === null) return "Multisede (sin límite)";
  return `Hasta ${maxSedes} sede${maxSedes === 1 ? "" : "s"}`;
}

/**
 * Números de referencia puramente visuales ("#TNT-001"), asignados por orden
 * de creación -- no es un campo de base de datos, así que se recalculan acá
 * y no cambian según el orden/filtro visible de la tabla.
 */
export function construirIdsDisplay(tenants: { id: string; createdAt: Date }[]): Map<string, string> {
  const ordenados = [...tenants].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return new Map(ordenados.map((tenant, index) => [tenant.id, `#TNT-${String(index + 1).padStart(3, "0")}`]));
}
