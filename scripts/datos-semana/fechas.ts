const MS_DIA = 86_400_000;

function aUtc(fecha: string): number {
  const [a, m, d] = fecha.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
}

function aTexto(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Suma `n` días (puede ser negativo) a una fecha "YYYY-MM-DD". */
export function sumarDias(fecha: string, n: number): string {
  return aTexto(aUtc(fecha) + n * MS_DIA);
}

/** Días entre `desde` y `hasta` (ambos incluidos), sin domingos. */
export function diasDelRango(desde: string, hasta: string): string[] {
  const dias: string[] = [];
  for (let ms = aUtc(desde); ms <= aUtc(hasta); ms += MS_DIA) {
    if (new Date(ms).getUTCDay() !== 0) dias.push(aTexto(ms));
  }
  return dias;
}

/** Instante en hora de Bogotá (UTC-5, sin horario de verano). */
export function instante(fecha: string, hora: string): Date {
  return new Date(`${fecha}T${hora}:00-05:00`);
}

/** Valor para columnas @db.Date: medianoche UTC del día. */
export function soloDia(fecha: string): Date {
  return new Date(`${fecha}T00:00:00.000Z`);
}

/** Fecha de hoy en Bogotá como "YYYY-MM-DD". */
export function hoyBogota(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(ahora);
}
