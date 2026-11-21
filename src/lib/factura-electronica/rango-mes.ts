/** Mes "YYYY-MM" en hora de Colombia (UTC-5, sin horario de verano). */
export function rangoMesBogota(mes: string): { desde: Date; hasta: Date } {
  const [anio, m] = mes.split("-").map(Number) as [number, number];
  const desde = new Date(Date.UTC(anio, m - 1, 1, 5));
  const hasta = new Date(Date.UTC(m === 12 ? anio + 1 : anio, m === 12 ? 0 : m, 1, 5));
  return { desde, hasta };
}
