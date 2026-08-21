const UN_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Half-open date filter for Prisma: `{ createdAt: { gte, lt } }`.
 * `lt` is the day AFTER the requested end date at UTC midnight, which makes
 * the whole of that end date part of the range.
 */
export interface RangoFechas {
  gte: Date;
  lt: Date;
}

function medianocheUtc(fecha: string): Date {
  return new Date(`${fecha}T00:00:00.000Z`);
}

function aFechaIso(fecha: Date): string {
  const anio = fecha.getUTCFullYear();
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getUTCDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

/**
 * Both arguments are `YYYY-MM-DD` strings already validated by
 * `reporteFiltrosSchema`. Boundaries are UTC — see the plan's Global
 * Constraints for why, and for the known local-timezone limitation.
 */
export function buildRangoFechas(desde: string, hasta: string): RangoFechas {
  return {
    gte: medianocheUtc(desde),
    lt: new Date(medianocheUtc(hasta).getTime() + UN_DIA_MS),
  };
}

/** Default range offered by the /reportes page: current UTC month to date. */
export function rangoMesActual(hoy: Date): { desde: string; hasta: string } {
  const primerDia = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
  return { desde: aFechaIso(primerDia), hasta: aFechaIso(hoy) };
}
