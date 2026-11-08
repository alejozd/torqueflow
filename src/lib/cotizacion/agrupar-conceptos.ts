export * from "@/lib/conceptos/conceptos";
import type { ConceptoVista } from "@/lib/conceptos/conceptos";

/** Forma mínima de un ItemCotizacion con su repuesto (los Decimal de Prisma se leen con Number). */
export interface ItemCotizacionConRepuesto {
  id: string;
  tipo: "REPUESTO" | "MANO_OBRA";
  descripcion: string;
  repuestoId: string | null;
  cantidad: unknown;
  precioUnitario: unknown;
  ivaPct: unknown;
  grupoKitId: string | null;
  grupoKitNombre: string | null;
  repuesto: { codigo: string; precioVenta: unknown; stockActual: number } | null;
}

/** Filas de la base → números planos, listos para viajar a un componente cliente. */
export function conceptosDesdeItems(items: ItemCotizacionConRepuesto[]): ConceptoVista[] {
  return items.map((item) => ({
    id: item.id,
    tipo: item.tipo,
    descripcion: item.descripcion,
    repuestoId: item.repuestoId,
    codigo: item.repuesto?.codigo ?? null,
    cantidad: Number(item.cantidad),
    precioUnitario: Number(item.precioUnitario),
    ivaPct: Number(item.ivaPct),
    precioCatalogo: item.repuesto ? Number(item.repuesto.precioVenta) : null,
    stockActual: item.repuesto ? item.repuesto.stockActual : null,
    grupoKitId: item.grupoKitId,
    grupoKitNombre: item.grupoKitNombre,
    editableCantidad: true,
    mecanico: null,
  }));
}
