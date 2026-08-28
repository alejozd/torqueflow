import { roundMoney } from "@/lib/money/round";

export const SIN_ASIGNAR_LABEL = "Sin asignar";

/** Map key for the null-mecánico bucket; a cuid can never collide with it. */
const SIN_ASIGNAR_KEY = "__sin_asignar__";

export interface ProductividadManoDeObra {
  valor: number;
}

export interface ProductividadOrden {
  mecanicoId: string | null;
  mecanicoNombre: string | null;
  manoDeObra: ProductividadManoDeObra[];
}

export interface ProductividadFila {
  mecanicoId: string | null;
  mecanicoNombre: string;
  ordenesCompletadas: number;
  montoManoDeObra: number;
}

export function computeProductividad(ordenes: ProductividadOrden[]): ProductividadFila[] {
  const acumulado = new Map<string, ProductividadFila>();

  for (const orden of ordenes) {
    const clave = orden.mecanicoId ?? SIN_ASIGNAR_KEY;
    let fila = acumulado.get(clave);
    if (!fila) {
      fila = {
        mecanicoId: orden.mecanicoId,
        mecanicoNombre: orden.mecanicoNombre ?? SIN_ASIGNAR_LABEL,
        ordenesCompletadas: 0,
        montoManoDeObra: 0,
      };
      acumulado.set(clave, fila);
    }

    fila.ordenesCompletadas += 1;
    for (const linea of orden.manoDeObra) {
      fila.montoManoDeObra += linea.valor;
    }
  }

  return [...acumulado.values()]
    .map((fila) => ({
      ...fila,
      montoManoDeObra: roundMoney(fila.montoManoDeObra),
    }))
    .sort(
      (a, b) =>
        b.montoManoDeObra - a.montoManoDeObra || a.mecanicoNombre.localeCompare(b.mecanicoNombre, "es"),
    );
}
