import type { ConceptoVista } from "@/lib/conceptos/conceptos";

/**
 * La orden guarda repuestos (`items_orden`) y mano de obra (`mano_de_obra`) en
 * tablas distintas, pero la pantalla las muestra en una sola lista, como la
 * cotización. El id de cada concepto lleva el nombre de su tabla para que no
 * choquen y para que las acciones sepan dónde escribir.
 */
export type TablaOrden = "item" | "mo";

export function idConceptoOrden(tabla: TablaOrden, id: string): string {
  return `${tabla}:${id}`;
}

export function leerIdConceptoOrden(conceptoId: string): { tabla: TablaOrden; id: string } | null {
  const separador = conceptoId.indexOf(":");
  if (separador <= 0) return null;
  const tabla = conceptoId.slice(0, separador);
  const id = conceptoId.slice(separador + 1);
  if ((tabla !== "item" && tabla !== "mo") || id === "") return null;
  return { tabla, id };
}

/** Forma mínima de un ItemOrden con su repuesto (los Decimal de Prisma se leen con Number). */
export interface ItemOrdenParaConcepto {
  id: string;
  repuestoId: string | null;
  descripcion: string;
  cantidad: number;
  precioUnitario: unknown;
  ivaPct: unknown;
  grupoKitId: string | null;
  grupoKitNombre: string | null;
  createdAt: Date;
  repuesto: { codigo: string; precioVenta: unknown; stockActual: number } | null;
}

/** Forma mínima de una línea de ManoDeObra con su mecánico. */
export interface ManoDeObraParaConcepto {
  id: string;
  descripcion: string;
  valor: unknown;
  ivaPct: unknown;
  grupoKitId: string | null;
  grupoKitNombre: string | null;
  createdAt: Date;
  mecanico: { id: string; nombre: string } | null;
}

/** Repuestos y mano de obra de la orden en una lista, en el orden en que se agregaron. */
export function conceptosDesdeOrden(
  items: ItemOrdenParaConcepto[],
  manoDeObra: ManoDeObraParaConcepto[],
): ConceptoVista[] {
  const filas: { creado: number; concepto: ConceptoVista }[] = [
    ...items.map((item) => ({
      creado: item.createdAt.getTime(),
      concepto: {
        id: idConceptoOrden("item", item.id),
        tipo: "REPUESTO" as const,
        descripcion: item.descripcion,
        repuestoId: item.repuestoId,
        codigo: item.repuesto?.codigo ?? null,
        cantidad: item.cantidad,
        precioUnitario: Number(item.precioUnitario),
        ivaPct: Number(item.ivaPct),
        precioCatalogo: item.repuesto ? Number(item.repuesto.precioVenta) : null,
        stockActual: item.repuesto ? item.repuesto.stockActual : null,
        grupoKitId: item.grupoKitId,
        grupoKitNombre: item.grupoKitNombre,
        editableCantidad: true,
        mecanico: null,
      },
    })),
    ...manoDeObra.map((linea) => ({
      creado: linea.createdAt.getTime(),
      concepto: {
        id: idConceptoOrden("mo", linea.id),
        tipo: "MANO_OBRA" as const,
        descripcion: linea.descripcion,
        repuestoId: null,
        codigo: null,
        // La mano de obra de la orden no tiene cantidad: es un valor.
        cantidad: 1,
        precioUnitario: Number(linea.valor),
        ivaPct: Number(linea.ivaPct),
        precioCatalogo: null,
        stockActual: null,
        grupoKitId: linea.grupoKitId,
        grupoKitNombre: linea.grupoKitNombre,
        editableCantidad: false,
        mecanico: linea.mecanico,
      },
    })),
  ];
  return filas.sort((a, b) => a.creado - b.creado).map((fila) => fila.concepto);
}
