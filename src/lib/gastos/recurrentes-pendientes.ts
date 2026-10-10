import { fechaEnPeriodo, periodosEntre } from "./periodo";

export interface PlantillaParaPendientes {
  id: string;
  descripcion: string;
  categoriaNombre: string;
  montoEstimado: number;
  diaDelMes: number;
  desde: string;
  activo: boolean;
  /** Periodos ya confirmados (con Gasto) u omitidos. */
  periodosResueltos: string[];
}

export interface RecurrentePendiente {
  recurrenteId: string;
  descripcion: string;
  categoriaNombre: string;
  periodo: string;
  fechaSugerida: Date;
  montoEstimado: number;
}

/**
 * Una plantilla activa queda pendiente en cada mes, desde `desde` hasta el
 * actual inclusive, que no tenga gasto confirmado ni omisión. Así un mes
 * olvidado sigue visible hasta que el ADMIN lo resuelva.
 */
export function calcularRecurrentesPendientes(
  plantillas: PlantillaParaPendientes[],
  periodoActual: string,
): RecurrentePendiente[] {
  const pendientes: RecurrentePendiente[] = [];
  for (const plantilla of plantillas) {
    if (!plantilla.activo) continue;
    const resueltos = new Set(plantilla.periodosResueltos);
    for (const periodo of periodosEntre(plantilla.desde, periodoActual)) {
      if (resueltos.has(periodo)) continue;
      pendientes.push({
        recurrenteId: plantilla.id,
        descripcion: plantilla.descripcion,
        categoriaNombre: plantilla.categoriaNombre,
        periodo,
        fechaSugerida: fechaEnPeriodo(periodo, plantilla.diaDelMes),
        montoEstimado: plantilla.montoEstimado,
      });
    }
  }
  return pendientes.sort(
    (a, b) => a.periodo.localeCompare(b.periodo) || a.descripcion.localeCompare(b.descripcion, "es"),
  );
}
