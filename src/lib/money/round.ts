/**
 * Canonical 2-decimal money rounding for this codebase. Relocated verbatim
 * from src/lib/factura/totales.ts (Fase 4) so the reportes aggregation
 * modules can share it instead of duplicating the same three characters of
 * float arithmetic. Also used for hour totals, which are Decimal(5, 2) in
 * the schema and therefore carry the same two-decimal precision.
 */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
