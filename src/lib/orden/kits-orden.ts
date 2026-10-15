import { roundMoney } from "@/lib/money/round";

export interface KitDeOrden {
  grupoKitId: string;
  nombre: string;
  /** Líneas del kit sumando repuestos y mano de obra. */
  conceptos: number;
  subtotal: number;
}

interface LineaConKit {
  grupoKitId: string | null;
  grupoKitNombre: string | null;
}

/**
 * Resume los kits aplicados a una orden. En la orden repuestos y mano de obra
 * viven en tablas distintas, así que un kit se arma juntando las líneas de las
 * dos que comparten grupo; el orden es el de la primera línea de cada kit.
 */
export function resumirKitsDeOrden(
  repuestos: (LineaConKit & { cantidad: number; precioUnitario: number })[],
  manoDeObra: (LineaConKit & { valor: number })[],
): KitDeOrden[] {
  const kits = new Map<string, KitDeOrden>();
  const lineas = [
    ...repuestos.map((linea) => ({ ...linea, importe: linea.cantidad * linea.precioUnitario })),
    ...manoDeObra.map((linea) => ({ ...linea, importe: linea.valor })),
  ];

  for (const linea of lineas) {
    if (linea.grupoKitId === null) continue;
    const kit = kits.get(linea.grupoKitId) ?? {
      grupoKitId: linea.grupoKitId,
      nombre: linea.grupoKitNombre ?? "Kit",
      conceptos: 0,
      subtotal: 0,
    };
    kit.conceptos += 1;
    kit.subtotal = roundMoney(kit.subtotal + linea.importe);
    kits.set(linea.grupoKitId, kit);
  }

  return [...kits.values()];
}
