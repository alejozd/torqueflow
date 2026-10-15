import { roundMoney } from "@/lib/money/round";
import { estadoDisponibilidad } from "./disponibilidad";

/** Una fila de la cotización ya lista para el cliente (sin Decimal de Prisma). */
export interface ConceptoVista {
  id: string;
  tipo: "REPUESTO" | "MANO_OBRA";
  descripcion: string;
  repuestoId: string | null;
  codigo: string | null;
  cantidad: number;
  precioUnitario: number;
  /** Precio de venta actual del repuesto; null en mano de obra e ítems libres. */
  precioCatalogo: number | null;
  /** Existencia en la bodega del repuesto; null si no viene del inventario. */
  stockActual: number | null;
  grupoKitId: string | null;
  grupoKitNombre: string | null;
}

export type BloqueConceptos =
  | { clase: "suelto"; concepto: ConceptoVista }
  | {
      clase: "kit";
      grupoKitId: string;
      nombre: string;
      conceptos: ConceptoVista[];
      subtotal: number;
      /** Repuestos del kit cuya bodega no cubre lo cotizado. */
      sinExistencia: number;
    };

export function importeConcepto(concepto: Pick<ConceptoVista, "cantidad" | "precioUnitario">): number {
  return roundMoney(concepto.cantidad * concepto.precioUnitario);
}

export function sinExistenciaSuficiente(concepto: ConceptoVista): boolean {
  return concepto.stockActual !== null && estadoDisponibilidad(concepto.stockActual, concepto.cantidad) !== "alcanza";
}

/** Un ítem libre (ni del inventario ni de un kit) deja editar su descripción y tipo. */
export function esConceptoLibre(concepto: Pick<ConceptoVista, "repuestoId" | "grupoKitId">): boolean {
  return concepto.repuestoId === null && concepto.grupoKitId === null;
}

/**
 * Agrupa las líneas de cada kit aplicado en un solo bloque, en el lugar donde
 * apareció su primera línea; las demás quedan sueltas en su orden.
 */
export function agruparConceptos(conceptos: ConceptoVista[]): BloqueConceptos[] {
  const bloques: BloqueConceptos[] = [];
  const kits = new Map<string, Extract<BloqueConceptos, { clase: "kit" }>>();

  for (const concepto of conceptos) {
    if (concepto.grupoKitId === null) {
      bloques.push({ clase: "suelto", concepto });
      continue;
    }
    let kit = kits.get(concepto.grupoKitId);
    if (!kit) {
      kit = {
        clase: "kit",
        grupoKitId: concepto.grupoKitId,
        nombre: concepto.grupoKitNombre ?? "Kit",
        conceptos: [],
        subtotal: 0,
        sinExistencia: 0,
      };
      kits.set(concepto.grupoKitId, kit);
      bloques.push(kit);
    }
    kit.conceptos.push(concepto);
    kit.subtotal = roundMoney(kit.subtotal + importeConcepto(concepto));
    if (sinExistenciaSuficiente(concepto)) kit.sinExistencia += 1;
  }

  return bloques;
}

/** Contador del pie de la tabla: "N conceptos · X repuestos · Y mano de obra". */
export function contarConceptos(conceptos: Pick<ConceptoVista, "tipo">[]): {
  total: number;
  repuestos: number;
  manoDeObra: number;
} {
  const repuestos = conceptos.filter((concepto) => concepto.tipo === "REPUESTO").length;
  return { total: conceptos.length, repuestos, manoDeObra: conceptos.length - repuestos };
}

/** Forma mínima de un ItemCotizacion con su repuesto (los Decimal de Prisma se leen con Number). */
export interface ItemCotizacionConRepuesto {
  id: string;
  tipo: "REPUESTO" | "MANO_OBRA";
  descripcion: string;
  repuestoId: string | null;
  cantidad: unknown;
  precioUnitario: unknown;
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
    precioCatalogo: item.repuesto ? Number(item.repuesto.precioVenta) : null,
    stockActual: item.repuesto ? item.repuesto.stockActual : null,
    grupoKitId: item.grupoKitId,
    grupoKitNombre: item.grupoKitNombre,
  }));
}
