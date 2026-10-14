import { formatoDiaBogota } from "@/lib/fecha-bogota";
import { roundMoney } from "@/lib/money/round";

/**
 * Facturación de la semana para el Inicio: los últimos 7 días de Bogotá,
 * separando lo cobrado de lo que sigue pendiente, comparados con los 7 días
 * anteriores, y unas frases que la interpretan. Las frases salen de reglas
 * fijas sobre estas mismas cifras (no de un modelo de IA): no cuestan nada,
 * no salen del servidor y siempre dicen lo mismo para los mismos datos.
 */

export interface DiaFacturacion {
  /** AAAA-MM-DD de Bogotá. */
  fecha: string;
  total: number;
  cobrado: number;
  pendiente: number;
  facturas: number;
}

export interface ResumenFacturacion {
  dias: DiaFacturacion[];
  total: number;
  cobrado: number;
  pendiente: number;
  facturas: number;
  facturasPendientes: number;
  totalSemanaAnterior: number;
  /** % frente a los 7 días anteriores; null si esa semana no tuvo facturas. */
  variacion: number | null;
  promedioDiario: number;
  mejorDia: DiaFacturacion | null;
  diasSinFacturar: number;
  lecturas: string[];
}

const formatoDiaLargo = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", timeZone: "UTC" });

/** "$4,1 M", "$590 mil", "$950": como se dice en Colombia (Intl dice "k"). */
export function pesosCompactos(valor: number): string {
  if (valor >= 1_000_000) {
    const millones = Math.round(valor / 100_000) / 10;
    return `$${String(millones).replace(".", ",")} M`;
  }
  if (valor >= 1_000) return `$${Math.round(valor / 1_000)} mil`;
  return `$${Math.round(valor)}`;
}

/** "martes 13", para una fecha AAAA-MM-DD. */
export function diaLargo(fecha: string): string {
  return formatoDiaLargo.format(new Date(`${fecha}T12:00:00.000Z`));
}

function plural(cantidad: number, singular: string, varias: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : varias}`;
}

/**
 * `facturas`: las de los 14 días, con su saldo actual. `dias14`: los 14 días de
 * Bogotá en orden (los 7 primeros son la semana anterior).
 */
export function resumirFacturacion(
  facturas: { createdAt: Date; total: number; saldoPendiente: number }[],
  dias14: string[],
): ResumenFacturacion {
  const anteriores = new Set(dias14.slice(0, 7));
  const porDia = new Map<string, DiaFacturacion>(
    dias14.slice(7).map((fecha) => [fecha, { fecha, total: 0, cobrado: 0, pendiente: 0, facturas: 0 }]),
  );

  let totalSemanaAnterior = 0;
  let facturasPendientes = 0;
  for (const factura of facturas) {
    const fecha = formatoDiaBogota.format(factura.createdAt);
    if (anteriores.has(fecha)) {
      totalSemanaAnterior = roundMoney(totalSemanaAnterior + factura.total);
      continue;
    }
    const dia = porDia.get(fecha);
    if (!dia) continue;
    const pendiente = Math.min(Math.max(factura.saldoPendiente, 0), factura.total);
    dia.total = roundMoney(dia.total + factura.total);
    dia.pendiente = roundMoney(dia.pendiente + pendiente);
    dia.cobrado = roundMoney(dia.total - dia.pendiente);
    dia.facturas += 1;
    if (pendiente > 0) facturasPendientes += 1;
  }

  const dias = [...porDia.values()];
  const total = roundMoney(dias.reduce((suma, dia) => suma + dia.total, 0));
  const pendiente = roundMoney(dias.reduce((suma, dia) => suma + dia.pendiente, 0));
  const cobrado = roundMoney(total - pendiente);
  const cantidad = dias.reduce((suma, dia) => suma + dia.facturas, 0);
  const variacion = totalSemanaAnterior > 0 ? Math.round(((total - totalSemanaAnterior) / totalSemanaAnterior) * 100) : null;
  const mejorDia = total > 0 ? dias.reduce((mejor, dia) => (dia.total > mejor.total ? dia : mejor)) : null;
  const diasSinFacturar = dias.filter((dia) => dia.facturas === 0).length;

  const resumen = {
    dias,
    total,
    cobrado,
    pendiente,
    facturas: cantidad,
    facturasPendientes,
    totalSemanaAnterior,
    variacion,
    promedioDiario: total / 7,
    mejorDia,
    diasSinFacturar,
  };
  return { ...resumen, lecturas: interpretar(resumen) };
}

function interpretar(r: Omit<ResumenFacturacion, "lecturas">): string[] {
  if (r.total === 0) {
    return [
      r.totalSemanaAnterior > 0
        ? `No hubo facturas en los últimos 7 días (la semana anterior se facturaron ${pesosCompactos(r.totalSemanaAnterior)}).`
        : "No hubo facturas en los últimos 14 días.",
    ];
  }

  const base = `Esta semana se facturaron ${pesosCompactos(r.total)} en ${plural(r.facturas, "factura", "facturas")}`;
  const comparacion =
    r.variacion === null
      ? `${base}. No hubo facturas en los 7 días anteriores para comparar.`
      : r.variacion === 0
        ? `${base}, lo mismo que los 7 días anteriores.`
        : `${base}, ${Math.abs(r.variacion)} % ${r.variacion > 0 ? "más" : "menos"} que los 7 días anteriores (${pesosCompactos(r.totalSemanaAnterior)}).`;

  const mejor = r.mejorDia!;
  const sinFacturar = r.diasSinFacturar > 0 ? ` Hubo ${plural(r.diasSinFacturar, "día", "días")} sin facturar.` : "";
  const mejorDia = `El mejor día fue el ${diaLargo(mejor.fecha)}, con ${pesosCompactos(mejor.total)}.${sinFacturar}`;

  const cobro =
    r.pendiente === 0
      ? "Todo lo facturado esta semana ya está cobrado."
      : `Ya se cobró el ${Math.round((r.cobrado / r.total) * 100)} % de lo facturado; quedan ${pesosCompactos(r.pendiente)} por cobrar en ${plural(r.facturasPendientes, "factura", "facturas")}.`;

  return [comparacion, mejorDia, cobro];
}
