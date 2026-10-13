import { formatoDiaBogota } from "@/lib/fecha-bogota";
import type { FrecuenciaLiquidacion } from "@/generated/prisma-tenant";

/**
 * Periodos de liquidación en tres frecuencias (D5). El periodo es un string
 * canónico -- `2026-10`, `2026-10-Q2` o `2026-W42` -- y cada liquidación guarda
 * con qué frecuencia se leyó, así que cambiar el ajuste del taller no
 * reinterpreta lo ya liquidado.
 *
 * Dos convenciones, y conviene no confundirlas:
 * - **Qué periodo es "ahora"** se lee del calendario de **Bogotá**
 *   (`formatoDiaBogota`), no de UTC: a las 21:00 del 31 de octubre en Bogotá ya
 *   es 1 de noviembre en UTC, y el periodo en curso sigue siendo octubre.
 * - **La ventana para consultar `entregadaAt`** son medianoches **UTC** del
 *   primer día del periodo y del día siguiente al último, exactamente como
 *   `buildRangoFechas` en `src/lib/reportes/rango-fechas.ts`. Es la misma regla
 *   que usa el reporte de productividad, a propósito: si la liquidación usara
 *   límites en hora de Bogotá y el reporte en UTC, los dos números que el
 *   usuario compara no cuadrarían (esa imprecisión de zona horaria ya existe en
 *   los reportes; unificarla es trabajo de otra fase).
 */

export interface RangoPeriodo {
  gte: Date;
  lt: Date;
}

const UN_DIA_MS = 24 * 60 * 60 * 1000;

const formatoMes = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric", timeZone: "UTC" });
const formatoDiaMes = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", timeZone: "UTC" });
const formatoDiaMesAnio = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const formatoDiaSolo = new Intl.DateTimeFormat("es-CO", { day: "numeric", timeZone: "UTC" });

function pad2(valor: number): string {
  return String(valor).padStart(2, "0");
}

function aDiaIso(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

function medianocheUtc(dia: string): Date {
  return new Date(`${dia}T00:00:00.000Z`);
}

function sumarDias(dia: string, dias: number): string {
  return aDiaIso(new Date(medianocheUtc(dia).getTime() + dias * UN_DIA_MS));
}

/** 1 = lunes … 7 = domingo (la semana ISO empieza el lunes). */
function diaIsoDeSemana(dia: string): number {
  const diaSemana = medianocheUtc(dia).getUTCDay();
  return diaSemana === 0 ? 7 : diaSemana;
}

function primerDiaDelMesSiguiente(anio: number, mes: number): string {
  const siguiente = new Date(Date.UTC(anio, mes, 1));
  return `${siguiente.getUTCFullYear()}-${pad2(siguiente.getUTCMonth() + 1)}-01`;
}

function partesMensual(periodo: string): [number, number] {
  const [anio, mes] = periodo.split("-").map(Number);
  return [anio!, mes!];
}

function partesQuincenal(periodo: string): [number, number, 1 | 2] {
  const [anio, mes, quincena] = periodo.split("-");
  return [Number(anio), Number(mes), quincena === "Q2" ? 2 : 1];
}

function partesSemanal(periodo: string): [number, number] {
  const [anio, semana] = periodo.split("-W");
  return [Number(anio), Number(semana)];
}

/**
 * El lunes de la semana ISO `semana` del año `anio`. El 4 de enero siempre cae
 * en la semana 1, así que su lunes es el ancla.
 */
function lunesDeSemanaIso(anio: number, semana: number): string {
  const cuatroDeEnero = new Date(Date.UTC(anio, 0, 4));
  const lunesDeLaPrimera = sumarDias(aDiaIso(cuatroDeEnero), 1 - diaIsoDeSemana(aDiaIso(cuatroDeEnero)));
  return sumarDias(lunesDeLaPrimera, (semana - 1) * 7);
}

/**
 * Año y semana ISO de un día de calendario. El año de la semana es el de su
 * jueves (por eso el desplazamiento hasta el jueves de esa misma semana).
 */
function semanaIsoDeDia(dia: string): { anio: number; semana: number } {
  const jueves = sumarDias(dia, 4 - diaIsoDeSemana(dia));
  const anio = Number(jueves.slice(0, 4));
  const lunesDeLaPrimera = lunesDeSemanaIso(anio, 1);
  const semanas = Math.round((medianocheUtc(jueves).getTime() - medianocheUtc(lunesDeLaPrimera).getTime()) / (7 * UN_DIA_MS));
  return { anio, semana: semanas + 1 };
}

/** Periodo en curso, leído del calendario de Bogotá. */
export function periodoActual(frecuencia: FrecuenciaLiquidacion, ahora: Date): string {
  const [anio, mes, dia] = formatoDiaBogota.format(ahora).split("-").map(Number);
  if (frecuencia === "MENSUAL") return `${anio}-${pad2(mes!)}`;
  if (frecuencia === "QUINCENAL") return `${anio}-${pad2(mes!)}-Q${dia! <= 15 ? 1 : 2}`;
  const { anio: anioSemana, semana } = semanaIsoDeDia(formatoDiaBogota.format(ahora));
  return `${anioSemana}-W${pad2(semana)}`;
}

/** Ventana `{ gte, lt }` del periodo, para filtrar `entregadaAt` (medianoches UTC). */
export function rangoDelPeriodo(frecuencia: FrecuenciaLiquidacion, periodo: string): RangoPeriodo {
  if (frecuencia === "MENSUAL") {
    const [anio, mes] = partesMensual(periodo);
    return { gte: medianocheUtc(`${anio}-${pad2(mes)}-01`), lt: medianocheUtc(primerDiaDelMesSiguiente(anio, mes)) };
  }
  if (frecuencia === "QUINCENAL") {
    const [anio, mes, quincena] = partesQuincenal(periodo);
    const inicio = quincena === 1 ? `${anio}-${pad2(mes)}-01` : `${anio}-${pad2(mes)}-16`;
    const fin = quincena === 1 ? `${anio}-${pad2(mes)}-16` : primerDiaDelMesSiguiente(anio, mes);
    return { gte: medianocheUtc(inicio), lt: medianocheUtc(fin) };
  }
  const [anio, semana] = partesSemanal(periodo);
  const lunes = lunesDeSemanaIso(anio, semana);
  return { gte: medianocheUtc(lunes), lt: medianocheUtc(sumarDias(lunes, 7)) };
}

export function periodoAnterior(frecuencia: FrecuenciaLiquidacion, periodo: string): string {
  if (frecuencia === "MENSUAL") {
    const [anio, mes] = partesMensual(periodo);
    return mes === 1 ? `${anio - 1}-12` : `${anio}-${pad2(mes - 1)}`;
  }
  if (frecuencia === "QUINCENAL") {
    const [anio, mes, quincena] = partesQuincenal(periodo);
    return quincena === 2
      ? `${anio}-${pad2(mes)}-Q1`
      : `${periodoAnterior("MENSUAL", `${anio}-${pad2(mes)}`)}-Q2`;
  }
  const { gte } = rangoDelPeriodo("SEMANAL", periodo);
  const { anio, semana } = semanaIsoDeDia(sumarDias(aDiaIso(gte), -7));
  return `${anio}-W${pad2(semana)}`;
}

export function periodoSiguiente(frecuencia: FrecuenciaLiquidacion, periodo: string): string {
  if (frecuencia === "MENSUAL") {
    const [anio, mes] = partesMensual(periodo);
    return mes === 12 ? `${anio + 1}-01` : `${anio}-${pad2(mes + 1)}`;
  }
  if (frecuencia === "QUINCENAL") {
    const [anio, mes, quincena] = partesQuincenal(periodo);
    return quincena === 1
      ? `${anio}-${pad2(mes)}-Q2`
      : `${periodoSiguiente("MENSUAL", `${anio}-${pad2(mes)}`)}-Q1`;
  }
  const { lt } = rangoDelPeriodo("SEMANAL", periodo);
  const { anio, semana } = semanaIsoDeDia(aDiaIso(lt));
  return `${anio}-W${pad2(semana)}`;
}

/** Etiqueta en español del periodo ("2ª quincena de octubre de 2026"). */
export function etiquetaPeriodo(frecuencia: FrecuenciaLiquidacion, periodo: string): string {
  if (frecuencia === "MENSUAL") {
    return formatoMes.format(medianocheUtc(`${periodo}-01`));
  }
  if (frecuencia === "QUINCENAL") {
    const [anio, mes, quincena] = partesQuincenal(periodo);
    return `${quincena}ª quincena de ${formatoMes.format(medianocheUtc(`${anio}-${pad2(mes)}-01`))}`;
  }
  const { gte, lt } = rangoDelPeriodo("SEMANAL", periodo);
  const inicio = gte;
  const fin = new Date(lt.getTime() - UN_DIA_MS);
  const mismoMes = inicio.getUTCFullYear() === fin.getUTCFullYear() && inicio.getUTCMonth() === fin.getUTCMonth();
  if (mismoMes) {
    return `semana del ${formatoDiaSolo.format(inicio)} al ${formatoDiaMesAnio.format(fin)}`;
  }
  if (inicio.getUTCFullYear() === fin.getUTCFullYear()) {
    return `semana del ${formatoDiaMes.format(inicio)} al ${formatoDiaMesAnio.format(fin)}`;
  }
  return `semana del ${formatoDiaMesAnio.format(inicio)} al ${formatoDiaMesAnio.format(fin)}`;
}

/**
 * ¿Se pisan dos periodos? Es la guarda que impide pagar dos veces el mismo
 * trabajo cuando el taller cambia de frecuencia (`2026-10` contra `2026-10-Q2`)
 * o cuando se genera un periodo ya cubierto (D6).
 */
export function ventanasSolapan(
  frecuenciaA: FrecuenciaLiquidacion,
  periodoA: string,
  frecuenciaB: FrecuenciaLiquidacion,
  periodoB: string,
): boolean {
  const a = rangoDelPeriodo(frecuenciaA, periodoA);
  const b = rangoDelPeriodo(frecuenciaB, periodoB);
  return a.gte.getTime() < b.lt.getTime() && b.gte.getTime() < a.lt.getTime();
}

const FORMATOS: { frecuencia: FrecuenciaLiquidacion; regex: RegExp }[] = [
  { frecuencia: "MENSUAL", regex: /^\d{4}-(0[1-9]|1[0-2])$/ },
  { frecuencia: "QUINCENAL", regex: /^\d{4}-(0[1-9]|1[0-2])-Q[12]$/ },
  { frecuencia: "SEMANAL", regex: /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/ },
];

/**
 * Frecuencia que corresponde a la forma de un periodo. Hace falta porque un
 * periodo ya liquidado sigue siendo legible (y pagable) después de que el
 * taller cambie de frecuencia: la forma del string lo identifica sin ambigüedad.
 */
export function frecuenciaDePeriodo(periodo: string): FrecuenciaLiquidacion | null {
  return FORMATOS.find((formato) => formato.regex.test(periodo))?.frecuencia ?? null;
}

/**
 * ¿Existe esa semana ISO en ese año? El formato `2027-W53` es sintácticamente
 * válido pero 2027 solo tiene 52 semanas: sin esta comprobación se crearía un
 * documento con una ventana que en realidad pertenece a 2028-W01, bloqueando
 * esa semana real.
 */
export function esSemanaIsoValida(anio: number, semana: number): boolean {
  const lunes = lunesDeSemanaIso(anio, semana);
  const real = semanaIsoDeDia(lunes);
  return real.anio === anio && real.semana === semana;
}
