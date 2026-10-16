import { formatoDiaBogota } from "@/lib/fecha-bogota";

/**
 * Formatos y colores compartidos por la lista de cuentas por pagar y sus
 * diálogos (servidor y cliente): pesos sin decimales y el mismo color de punto
 * para la misma idea en toda la pantalla.
 */

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export function pesos(valor: number): string {
  return formatoMoneda.format(valor);
}

// `fecha` de la cuenta es de solo día (@db.Date, medianoche UTC del día de Bogotá):
// se lee en UTC, o en Bogotá caería el día anterior.
const formatoDiaCuenta = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "UTC" });
const formatoDiaCorto = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" });
const formatoDiaPago = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" });
const formatoHora = new Intl.DateTimeFormat("es-CO", { timeStyle: "short", timeZone: "America/Bogota" });

/** «4 sept 2026»: el día de la entrada. */
export function fechaCuenta(fecha: Date): string {
  return formatoDiaCuenta.format(fecha);
}

/** «Hoy, 1:58 p. m.» o «4 sept 2026, 1:58 p. m.»: cuándo se registró un abono. */
export function fechaHoraPago(instante: Date, ahora: Date = new Date()): string {
  const dia = formatoDiaBogota.format(instante) === formatoDiaBogota.format(ahora) ? "Hoy" : formatoDiaPago.format(instante);
  return `${dia}, ${formatoHora.format(instante)}`;
}

/** «Pagada hoy» o «Pagada el 12 oct»: el chip de la pestaña Pagadas. */
export function etiquetaPagada(instante: Date, ahora: Date = new Date()): string {
  return formatoDiaBogota.format(instante) === formatoDiaBogota.format(ahora)
    ? "Pagada hoy"
    : `Pagada el ${formatoDiaCorto.format(instante)}`;
}

export function esDeHoy(instante: Date, ahora: Date = new Date()): boolean {
  return formatoDiaBogota.format(instante) === formatoDiaBogota.format(ahora);
}

/** Color del punto (chips, badges, notas). */
export const PUNTO = {
  verde: "bg-[oklch(0.6_0.17_150)]",
  azul: "bg-[oklch(0.55_0.15_255)]",
  ambar: "bg-[oklch(0.66_0.16_60)]",
  rojo: "bg-destructive",
  gris: "bg-muted-foreground",
} as const;

/** Verde vivo del ✓ (sin círculo) y de «Pagada». */
export const TEXTO_VERDE = "text-[oklch(0.55_0.19_148)]";

/** El color de la antigüedad sube igual que los KPI: azul, ámbar a los 61, rojo a los 91. */
export function puntoAntiguedad(dias: number): string {
  if (dias > 90) return PUNTO.rojo;
  if (dias > 60) return PUNTO.ambar;
  if (dias > 30) return PUNTO.azul;
  return PUNTO.verde;
}

export function etiquetaAntiguedad(dias: number): string {
  if (dias > 90) return "Más de 90 días";
  return `${dias} ${dias === 1 ? "día" : "días"}`;
}

export const METODOS_PAGO = [
  { valor: "TRANSFERENCIA", etiqueta: "Transferencia" },
  { valor: "EFECTIVO", etiqueta: "Efectivo" },
  { valor: "TARJETA", etiqueta: "Tarjeta" },
  { valor: "OTRO", etiqueta: "Otro" },
] as const;

export type MetodoPagoAbono = (typeof METODOS_PAGO)[number]["valor"];

export function etiquetaMetodo(metodo: string): string {
  return METODOS_PAGO.find((m) => m.valor === metodo)?.etiqueta ?? (metodo === "ANTICIPO" ? "Anticipo" : metodo);
}

export function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}
