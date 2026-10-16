import { formatoDiaBogota } from "@/lib/fecha-bogota";
import { cantidadDevolvible } from "@/lib/mostrador/ventas";

/**
 * Reglas de la pestaña Ventas del mostrador (rediseño, §5), sin Prisma y con
 * test propio: los filtros de fecha, el tope de 30 días del rango, el estado que
 * se muestra y el resumen de productos de cada fila.
 */

export const MAX_DIAS_RANGO_VENTAS = 30;

const MS_DIA = 24 * 60 * 60 * 1000;
const FORMATO_DIA = /^\d{4}-\d{2}-\d{2}$/;

export type FiltroVentas = "hoy" | "ayer" | "30dias";

export interface RangoVentas {
  /** Días de Bogotá "AAAA-MM-DD", ambos incluidos. */
  desde: string;
  hasta: string;
}

function inicioDe(dia: string): Date {
  return new Date(`${dia}T00:00:00-05:00`);
}

function diaMas(dia: string, dias: number): string {
  return formatoDiaBogota.format(new Date(inicioDe(dia).getTime() + dias * MS_DIA));
}

/** Hoy, ayer o los últimos 30 días (hoy y los 30 anteriores: lo que aún se puede devolver). */
export function rangoDelFiltro(filtro: FiltroVentas, ahora: Date): RangoVentas {
  const hoy = formatoDiaBogota.format(ahora);
  if (filtro === "ayer") {
    const ayer = diaMas(hoy, -1);
    return { desde: ayer, hasta: ayer };
  }
  if (filtro === "30dias") return { desde: diaMas(hoy, -MAX_DIAS_RANGO_VENTAS), hasta: hoy };
  return { desde: hoy, hasta: hoy };
}

/**
 * Convierte el rango en la ventana `[inicio, fin)` de `createdAt`. Rechaza fechas
 * mal escritas, un rango al revés y uno de más de 30 días (no se carga medio año
 * de ventas en la pantalla del mostrador).
 */
export function ventanaDelRango(rango: RangoVentas): { inicio: Date; fin: Date } | { error: string } {
  const { desde, hasta } = rango;
  if (!FORMATO_DIA.test(desde) || !FORMATO_DIA.test(hasta)) return { error: "Fechas inválidas" };
  const inicio = inicioDe(desde);
  const ultimo = inicioDe(hasta);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(ultimo.getTime())) return { error: "Fechas inválidas" };
  // La fecha tiene que existir (no "2026-02-31"): al volver a formatearla no cambia.
  if (formatoDiaBogota.format(inicio) !== desde || formatoDiaBogota.format(ultimo) !== hasta) {
    return { error: "Fechas inválidas" };
  }
  if (ultimo.getTime() < inicio.getTime()) return { error: "La fecha inicial va antes de la final" };
  if ((ultimo.getTime() - inicio.getTime()) / MS_DIA > MAX_DIAS_RANGO_VENTAS) {
    return { error: `El rango puede ser de máximo ${MAX_DIAS_RANGO_VENTAS} días` };
  }
  return { inicio, fin: new Date(ultimo.getTime() + MS_DIA) };
}

export type EstadoVentaMostrador = "PAGADA" | "A_CREDITO" | "DEVUELTA_PARCIAL" | "DEVUELTA";

export const ETIQUETA_ESTADO_VENTA: Record<EstadoVentaMostrador, string> = {
  PAGADA: "Pagada",
  A_CREDITO: "A crédito",
  DEVUELTA_PARCIAL: "Devuelta parcial",
  DEVUELTA: "Devuelta",
};

/** Lo devuelto manda sobre el pago: una venta devuelta del todo ya no es "A crédito". */
export function estadoVentaMostrador(
  items: { cantidad: number; devueltoCantidad: number }[],
  saldoPendiente: number,
): EstadoVentaMostrador {
  const algoDevuelto = items.some((item) => item.devueltoCantidad > 0);
  if (algoDevuelto && items.every((item) => cantidadDevolvible(item.cantidad, item.devueltoCantidad) === 0)) {
    return "DEVUELTA";
  }
  if (algoDevuelto) return "DEVUELTA_PARCIAL";
  return saldoPendiente > 0 ? "A_CREDITO" : "PAGADA";
}

/** Si a la venta todavía le queda algo por devolver (aunque quien mira no pueda). */
export function quedaPorDevolver(items: { cantidad: number; devueltoCantidad: number }[]): boolean {
  return items.some((item) => cantidadDevolvible(item.cantidad, item.devueltoCantidad) > 0);
}

/** "Filtro de aceite ×2, +2 más" (el primer producto y cuántos más hay). */
export function resumirProductos(items: { descripcion: string; cantidad: number }[]): string {
  const [primero, ...resto] = items;
  if (!primero) return "—";
  const base = primero.cantidad > 1 ? `${primero.descripcion} ×${primero.cantidad}` : primero.descripcion;
  return resto.length > 0 ? `${base}, +${resto.length} más` : base;
}
