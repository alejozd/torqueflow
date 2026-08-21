/**
 * The single definition of "belongs to this sede" for every sede-aware entity.
 * Each function returns a Prisma `where` fragment meant to be spread into a
 * larger filter:
 *
 *     tenantDb.ordenTrabajo.findFirst({ where: { id, ...scopeOrden(sedeActivaId) } })
 *
 * Spreading into `findFirst` (never `findUnique`) is the point: `findUnique`
 * accepts only unique columns, so an id-only lookup silently reaches across
 * sedes. Every "get one by id" in a sede-aware module must be a `findFirst`
 * carrying one of these fragments, or it is an IDOR across the sede boundary.
 *
 * Deliberately Prisma-type-free: plain object literals, so this module is
 * unit-testable without a database and a reviewer can audit the whole
 * isolation boundary in one screen.
 */

/** OrdenTrabajo.sedeId is a required, indexed column. */
export function scopeOrden(sedeActivaId: string): { sedeId: string } {
  return { sedeId: sedeActivaId };
}

/** Bodega.sedeId is a required, indexed column. */
export function scopeBodega(sedeActivaId: string): { sedeId: string } {
  return { sedeId: sedeActivaId };
}

/** Repuesto has no sede_id; it inherits one through its required Bodega. */
export function scopeRepuesto(sedeActivaId: string): { bodega: { sedeId: string } } {
  return { bodega: { sedeId: sedeActivaId } };
}

/** EntradaMercancia has no sede_id; it inherits one through its required Bodega. */
export function scopeEntrada(sedeActivaId: string): { bodega: { sedeId: string } } {
  return { bodega: { sedeId: sedeActivaId } };
}

/** Factura has no sede_id; it inherits one through its required OrdenTrabajo. */
export function scopeFactura(sedeActivaId: string): { orden: { sedeId: string } } {
  return { orden: { sedeId: sedeActivaId } };
}
