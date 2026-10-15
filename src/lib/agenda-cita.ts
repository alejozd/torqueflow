/**
 * Lógica pura del selector de día y hora de las citas. Todo trabaja con la
 * fecha del taller como texto "YYYY-MM-DD" y la hora como minutos desde la
 * medianoche, nunca con new Date(y, m, d) del navegador: así un equipo con la
 * zona horaria mal configurada no corre la cita. Bogotá es UTC-5 fijo (sin
 * horario de verano), la misma suposición que citaInputSchema.
 */

const formatoFechaHoraBogota = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export interface MomentoBogota {
  /** "YYYY-MM-DD" */
  fecha: string;
  /** Minutos desde la medianoche, 0..1439. */
  minutos: number;
}

/** Una cita ya agendada, reducida a lo que el selector muestra como ocupación. */
export interface OcupacionCita {
  fecha: string;
  minutos: number;
  placa: string;
  motivo: string;
}

export function momentoBogota(fecha: Date): MomentoBogota {
  const partes = formatoFechaHoraBogota.formatToParts(fecha);
  const obtener = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return {
    fecha: `${obtener("year")}-${obtener("month")}-${obtener("day")}`,
    minutos: Number(obtener("hour")) * 60 + Number(obtener("minute")),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** El texto "YYYY-MM-DDTHH:mm" (hora Bogotá) que espera citaInputSchema. */
export function valorFechaHora(fecha: string, minutos: number): string {
  return `${fecha}T${pad(Math.floor(minutos / 60))}:${pad(minutos % 60)}`;
}

export function valorFechaHoraDeDate(fecha: Date): string {
  const momento = momentoBogota(fecha);
  return valorFechaHora(momento.fecha, momento.minutos);
}

/** Lee "YYYY-MM-DDTHH:mm"; null si está vacío o mal formado. */
export function leerValorFechaHora(valor: string): MomentoBogota | null {
  const coincidencia = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(valor);
  if (!coincidencia) return null;
  return { fecha: coincidencia[1], minutos: Number(coincidencia[2]) * 60 + Number(coincidencia[3]) };
}

function partesIso(iso: string): [number, number, number] {
  const [anio, mes, dia] = iso.split("-").map(Number);
  return [anio, mes, dia];
}

export function sumarDias(iso: string, dias: number): string {
  const [anio, mes, dia] = partesIso(iso);
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

/** 0 = domingo .. 6 = sábado. */
export function diaSemana(iso: string): number {
  const [anio, mes, dia] = partesIso(iso);
  return new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
}

export function diasDelMes(mesIso: string): number {
  const [anio, mes] = mesIso.split("-").map(Number);
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/** "2026-10" + 1 -> "2026-11"; normaliza el cambio de año. */
export function sumarMeses(mesIso: string, meses: number): string {
  const [anio, mes] = mesIso.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1 + meses, 1)).toISOString().slice(0, 7);
}

/** "3:30 p. m.", como se escribe en Colombia. */
export function formatoHora12(minutos: number): string {
  const hora = Math.floor(minutos / 60);
  return `${hora % 12 || 12}:${pad(minutos % 60)} ${hora < 12 ? "a. m." : "p. m."}`;
}

/** "jueves 16 de octubre" */
export function formatoDiaLargo(iso: string): string {
  const [, mes, dia] = partesIso(iso);
  return `${DIAS_LARGOS[diaSemana(iso)]} ${dia} de ${MESES_LARGOS[mes - 1]}`;
}

/** "jue 16 oct" */
export function formatoDiaCorto(iso: string): string {
  const [, mes, dia] = partesIso(iso);
  return `${DIAS_CORTOS[diaSemana(iso)]} ${dia} ${MESES_CORTOS[mes - 1]}`;
}

export function nombreDiaCorto(iso: string): string {
  return DIAS_CORTOS[diaSemana(iso)];
}

export function nombreMesCorto(iso: string): string {
  return MESES_CORTOS[partesIso(iso)[1] - 1];
}

/** "octubre de 2026" */
export function formatoMesLargo(mesIso: string): string {
  const [anio, mes] = mesIso.split("-").map(Number);
  return `${MESES_LARGOS[mes - 1]} de ${anio}`;
}

/** Las horas que se ofrecen como botones: desde la apertura hasta antes del cierre. */
export function horasDelDia(apertura: number, cierre: number, paso: number): number[] {
  const horas: number[] = [];
  for (let minutos = apertura; minutos < cierre; minutos += paso) horas.push(minutos);
  return horas;
}

export function esMomentoPasado(fecha: string, minutos: number, ahora: MomentoBogota): boolean {
  return fecha < ahora.fecha || (fecha === ahora.fecha && minutos <= ahora.minutos);
}

/**
 * Lee una hora escrita a mano: "10:15", "15:45", "3:45 pm", "3 de la tarde".
 * Sin a. m./p. m., de 1 a 6 se toma como de la tarde: en un taller "a las 3"
 * nunca es de madrugada.
 */
export function leerHoraEscrita(texto: string): number | null {
  const limpio = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
  const coincidencia = /^(\d{1,2})(?:[:h ](\d{2}))?\s*(am|pm|a m|p m|m|de la manana|de la tarde|de la noche)?$/.exec(limpio);
  if (!coincidencia) return null;

  let hora = Number(coincidencia[1]);
  const minutos = coincidencia[2] ? Number(coincidencia[2]) : 0;
  const sufijo = coincidencia[3] ?? "";
  if (hora > 23 || minutos > 59) return null;

  const esTarde = ["pm", "p m", "m", "de la tarde", "de la noche"].includes(sufijo);
  const esManana = ["am", "a m", "de la manana"].includes(sufijo);
  if (esTarde && hora < 12) hora += 12;
  else if (esManana && hora === 12) hora = 0;
  else if (!sufijo && hora >= 1 && hora <= 6) hora += 12;

  return hora * 60 + minutos;
}

/** Las citas ya agendadas que cuentan como ocupación: sin canceladas ni la que se está editando. */
export function ocupacionDeCitas(
  citas: { id: string; fechaHora: Date; estado: string; motivo: string; vehiculo: { placa: string } }[],
  opciones: { desde: string; excluirId?: string },
): OcupacionCita[] {
  return citas
    .filter((cita) => cita.estado !== "CANCELADA" && cita.id !== opciones.excluirId)
    .map((cita) => ({ ...momentoBogota(cita.fechaHora), placa: cita.vehiculo.placa, motivo: cita.motivo }))
    .filter((ocupacion) => ocupacion.fecha >= opciones.desde)
    .sort((a, b) => (a.fecha === b.fecha ? a.minutos - b.minutos : a.fecha < b.fecha ? -1 : 1));
}
