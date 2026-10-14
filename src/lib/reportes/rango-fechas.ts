import { formatoDiaBogota } from "@/lib/fecha-bogota";

const UN_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Filtro semiabierto para Prisma: `{ campo: { gte, lt } }`. `lt` es el día
 * SIGUIENTE a `hasta`, así que `hasta` entra completo.
 */
export interface RangoFechas {
  gte: Date;
  lt: Date;
}

/**
 * Para columnas de **instante** (`createdAt`, `entregadaAt`, `fechaHora`): los
 * días son de Bogotá (UTC-5 fijo, sin horario de verano). Con medianoches UTC,
 * lo ocurrido después de las 7 p. m. caía en el día siguiente: el Inicio
 * cambiaba de "hoy" a esa hora y los reportes partían mal los meses.
 *
 * Los dos argumentos son `AAAA-MM-DD` ya validados (`reporteFiltrosSchema`).
 */
export function buildRangoFechas(desde: string, hasta: string): RangoFechas {
  const gte = new Date(`${desde}T00:00:00-05:00`);
  return { gte, lt: new Date(new Date(`${hasta}T00:00:00-05:00`).getTime() + UN_DIA_MS) };
}

/**
 * Para columnas de **solo fecha** (`@db.Date`, como `Gasto.fecha`): Prisma las
 * lee y escribe como medianoche UTC, así que el rango va en UTC. No mezclarlo
 * con `buildRangoFechas`.
 */
export function buildRangoDias(desde: string, hasta: string): RangoFechas {
  const gte = new Date(`${desde}T00:00:00.000Z`);
  return { gte, lt: new Date(new Date(`${hasta}T00:00:00.000Z`).getTime() + UN_DIA_MS) };
}

/** Rango por defecto de /reportes: el mes en curso en Bogotá, del día 1 hasta hoy. */
export function rangoMesActual(hoy: Date): { desde: string; hasta: string } {
  const hasta = formatoDiaBogota.format(hoy);
  return { desde: `${hasta.slice(0, 7)}-01`, hasta };
}
