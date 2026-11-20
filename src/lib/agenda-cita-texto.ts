const formatoFechaCita = new Intl.DateTimeFormat("es-CO", {
  weekday: "long",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Bogota",
});

const ESTADO_CITA: Record<string, string> = {
  PROGRAMADA: "programada",
  CONFIRMADA: "confirmada",
  CANCELADA: "cancelada",
  COMPLETADA: "completada",
};

/** "viernes, 21 nov, 9:00 a. m. · programada" (en hora de Bogotá). */
export function textoFechaCita(fechaHora: Date, estado: string): string {
  return `${formatoFechaCita.format(fechaHora)} · ${ESTADO_CITA[estado] ?? estado}`;
}
