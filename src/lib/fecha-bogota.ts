/**
 * Shared America/Bogota date helpers used across every list page's KPI
 * month/week windows and "Ingreso"/"Emitida"-style relative timestamps.
 * Bogota is a fixed UTC-5 offset with no daylight saving time, so every
 * boundary here is derived without a timezone library: read the Bogota
 * calendar date/month via Intl, then reconstruct that instant as an
 * explicit UTC-5 timestamp.
 */

export const formatoFechaCorta = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" });

export const formatoDiaBogota = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" });

const formatoMesBogota = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
});

export function inicioDiaBogota(fecha: Date): Date {
  return new Date(`${formatoDiaBogota.format(fecha)}T00:00:00-05:00`);
}

/** offsetMeses: 1 safely rolls December into the next January (Date.UTC normalizes month overflow). */
export function inicioMesBogota(fecha: Date, offsetMeses = 0): Date {
  const [anioStr, mesStr] = formatoMesBogota.format(fecha).split("-");
  const base = new Date(Date.UTC(Number(anioStr), Number(mesStr) - 1 + offsetMeses, 1));
  const anio = base.getUTCFullYear();
  const mes = String(base.getUTCMonth() + 1).padStart(2, "0");
  return new Date(`${anio}-${mes}-01T00:00:00-05:00`);
}

/** Monday-start week. */
export function inicioSemanaBogota(fecha: Date): Date {
  const inicioHoy = inicioDiaBogota(fecha);
  const diaSemana = inicioHoy.getUTCDay(); // 0=domingo..6=sábado
  const diasDesdeElLunes = diaSemana === 0 ? 6 : diaSemana - 1;
  return new Date(inicioHoy.getTime() - diasDesdeElLunes * 24 * 60 * 60 * 1000);
}

/**
 * "Hoy" only for the just-created case (<1min, where "Hace 0 minutos" would
 * read oddly); every other same-day row shows "Hace X horas" instead of a
 * flat "Hoy" so recency inside the day stays visible. Rows 7+ days old fall
 * back to the absolute date -- "Hace 34 días" is harder to place mentally.
 */
export function formatoFechaRelativa(fecha: Date, ahora: Date): string {
  const diffMs = ahora.getTime() - fecha.getTime();
  const diffMin = Math.floor(diffMs / (60 * 1000));
  if (diffMin < 1) return "Hoy";
  if (diffMin < 60) return `Hace ${diffMin} ${diffMin === 1 ? "minuto" : "minutos"}`;

  const mismoDia = formatoDiaBogota.format(fecha) === formatoDiaBogota.format(ahora);
  const diffHoras = Math.floor(diffMin / 60);
  if (mismoDia) return `Hace ${diffHoras} ${diffHoras === 1 ? "hora" : "horas"}`;

  const diffDias = Math.floor(diffHoras / 24);
  if (diffDias < 7) return `Hace ${diffDias} ${diffDias === 1 ? "día" : "días"}`;

  return formatoFechaCorta.format(fecha);
}
