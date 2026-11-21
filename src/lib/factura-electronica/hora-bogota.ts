// src/lib/factura-electronica/hora-bogota.ts
const FORMATO = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Fecha (YYYY-MM-DD) y hora (HH:mm:ss) de Colombia para el documento electrónico. */
export function fechaHoraBogota(momento: Date): { fecha: string; hora: string } {
  const p = Object.fromEntries(FORMATO.formatToParts(momento).map((parte) => [parte.type, parte.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}:${p.second}` };
}
