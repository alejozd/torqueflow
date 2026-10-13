import { roundMoney } from "@/lib/money/round";

/**
 * Atribución del trabajo de una orden a quien realmente lo hizo (D3): cada línea
 * de mano de obra se le adjudica a su propio `mecanicoId` y, si la línea no
 * tiene, al mecánico asignado a la orden. De aquí salen tanto el reporte de
 * rendimiento por técnico como la liquidación, para que los dos números que el
 * usuario compara no puedan divergir.
 *
 * Ojo: esto **cambia** los números del reporte de productividad de la Fase 5 en
 * el caso de una línea con mecánico distinto al de la orden (antes toda la mano
 * de obra de la orden se le abonaba al mecánico de la orden).
 */

export const SIN_ASIGNAR_LABEL = "Sin asignar";

/** Map key for the null-mecánico bucket; a cuid can never collide with it. */
const SIN_ASIGNAR_KEY = "__sin_asignar__";

export interface LineaManoDeObraProduccion {
  valor: number;
  /** Mecánico que hizo la línea; null = la hizo el de la orden. */
  mecanicoId: string | null;
  mecanicoNombre: string | null;
}

export interface OrdenProduccion {
  /** Mecánico asignado a la orden, que es el que hereda una línea sin mecánico. */
  mecanicoId: string | null;
  mecanicoNombre: string | null;
  manoDeObra: LineaManoDeObraProduccion[];
}

export interface LineaAtribuida {
  mecanicoId: string | null;
  mecanicoNombre: string | null;
  valor: number;
}

export interface ProduccionFila {
  mecanicoId: string | null;
  mecanicoNombre: string;
  /** Órdenes distintas en las que el mecánico hizo al menos un trabajo. */
  ordenes: number;
  /** Líneas de mano de obra: la unidad con la que este taller liquida (D7). */
  trabajos: number;
  montoManoObra: number;
}

export function atribuirManoDeObra(orden: OrdenProduccion): LineaAtribuida[] {
  return orden.manoDeObra.map((linea) => ({
    mecanicoId: linea.mecanicoId ?? orden.mecanicoId,
    mecanicoNombre: linea.mecanicoId ? linea.mecanicoNombre : orden.mecanicoNombre,
    valor: linea.valor,
  }));
}

/**
 * Dos atribuciones distintas, a propósito:
 * - **Órdenes entregadas** se le cuentan al mecánico asignado a la orden (regla
 *   del reporte desde la Fase 5), aunque la orden no tenga líneas de mano de
 *   obra: es "quién entregó qué".
 * - **Trabajos y mano de obra** se le cuentan a quien hizo cada línea (D3), que
 *   puede ser otro mecánico; es lo que se liquida.
 *
 * Por eso un mecánico puede aparecer con 0 órdenes y varios trabajos (le hizo
 * líneas a órdenes de otros), y una orden sin líneas deja una fila con 0
 * trabajos y 0 dinero.
 */
export function computeProduccionPorMecanico(ordenes: OrdenProduccion[]): ProduccionFila[] {
  const acumulado = new Map<string, ProduccionFila>();

  function filaDe(mecanicoId: string | null, mecanicoNombre: string | null): ProduccionFila {
    const clave = mecanicoId ?? SIN_ASIGNAR_KEY;
    let fila = acumulado.get(clave);
    if (!fila) {
      fila = {
        mecanicoId,
        mecanicoNombre: mecanicoNombre ?? SIN_ASIGNAR_LABEL,
        ordenes: 0,
        trabajos: 0,
        montoManoObra: 0,
      };
      acumulado.set(clave, fila);
    }
    return fila;
  }

  for (const orden of ordenes) {
    filaDe(orden.mecanicoId, orden.mecanicoNombre).ordenes += 1;

    for (const linea of atribuirManoDeObra(orden)) {
      const fila = filaDe(linea.mecanicoId, linea.mecanicoNombre);
      fila.trabajos += 1;
      fila.montoManoObra += linea.valor;
    }
  }

  return [...acumulado.values()]
    .map((fila) => ({ ...fila, montoManoObra: roundMoney(fila.montoManoObra) }))
    .sort((a, b) => b.montoManoObra - a.montoManoObra || a.mecanicoNombre.localeCompare(b.mecanicoNombre, "es"));
}
