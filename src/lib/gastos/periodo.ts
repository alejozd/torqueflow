import { formatoDiaBogota } from "@/lib/fecha-bogota";

/**
 * Periodos contables "YYYY-MM". El periodo actual se lee del calendario de
 * Bogotá; las columnas @db.Date (medianoche UTC) se leen por fecha calendario.
 */
const formatoMes = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric", timeZone: "UTC" });

function partes(periodo: string): [number, number] {
  const [anio, mes] = periodo.split("-").map(Number);
  return [anio, mes];
}

function aPeriodo(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

export function periodoActualBogota(ahora: Date): string {
  return formatoDiaBogota.format(ahora).slice(0, 7);
}

export function periodoDeFechaDb(fecha: Date): string {
  return fecha.toISOString().slice(0, 7);
}

export function periodoAnterior(periodo: string): string {
  const [anio, mes] = partes(periodo);
  return mes === 1 ? aPeriodo(anio - 1, 12) : aPeriodo(anio, mes - 1);
}

function periodoSiguiente(periodo: string): string {
  const [anio, mes] = partes(periodo);
  return mes === 12 ? aPeriodo(anio + 1, 1) : aPeriodo(anio, mes + 1);
}

export function periodosEntre(desde: string, hasta: string): string[] {
  const periodos: string[] = [];
  for (let actual = desde; actual <= hasta; actual = periodoSiguiente(actual)) {
    periodos.push(actual);
  }
  return periodos;
}

export function rangoDelPeriodo(periodo: string): { gte: Date; lt: Date } {
  return {
    gte: new Date(`${periodo}-01T00:00:00.000Z`),
    lt: new Date(`${periodoSiguiente(periodo)}-01T00:00:00.000Z`),
  };
}

export function fechaEnPeriodo(periodo: string, dia: number): Date {
  return new Date(`${periodo}-${String(dia).padStart(2, "0")}T00:00:00.000Z`);
}

export function ETIQUETA_MES(periodo: string): string {
  return formatoMes.format(new Date(`${periodo}-01T00:00:00.000Z`));
}
