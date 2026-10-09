import type { EstadoOrden } from "@/generated/prisma-tenant";

/**
 * Inventory-alert math for the Inicio dashboard, kept DB-free so every rule
 * is unit-testable. The action layer (alertas-inventario-actions.ts) only
 * fetches rows and hands them here.
 *
 * Stock is decremented when an orden is invoiced (factura-actions.ts), not
 * when a repuesto is added to it, so `stockActual` over-reports what is
 * really free: units already sitting on open, uninvoiced ordenes are spoken
 * for. Every alert therefore works on `disponible = stockActual - comprometido`.
 */

export const DIAS_CONSUMO = 90;
export const SEMANAS_TENDENCIA = 8;
/** Lead time for repuestos without a proveedor (same default as Proveedor.diasEntrega). */
export const DIAS_ENTREGA_DEFAULT = 3;
/** Extra days of demand the suggested quantity covers beyond the lead time. */
export const DIAS_COBERTURA_OBJETIVO = 14;
/** How long "Posponer" hides an alert from the dashboard lists. */
export const DIAS_POSPONER_ALERTA = 7;

const MS_DIA = 24 * 60 * 60 * 1000;

export type SeveridadAlerta = "SIN_DISPONIBLE" | "CRITICO" | "BAJO_MINIMO";

const RANGO_SEVERIDAD: Record<SeveridadAlerta, number> = { SIN_DISPONIBLE: 0, CRITICO: 1, BAJO_MINIMO: 2 };

export interface RepuestoAlertaInput {
  id: string;
  codigo: string;
  nombre: string;
  stockActual: number;
  stockMinimo: number;
  precioCompra: number;
  stockMaximo: number | null;
  multiploCompra: number;
  alertaPospuestaHasta: Date | null;
  bodega: { id: string; nombre: string };
  proveedor: ProveedorAlerta | null;
}

export interface ProveedorAlerta {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  diasEntrega: number;
}

export interface ItemComprometidoInput {
  repuestoId: string;
  cantidad: number;
  orden: { id: string; estado: EstadoOrden; placa: string; vehiculo: string };
}

export interface ItemConsumidoInput {
  repuestoId: string;
  cantidad: number;
  /** Invoice date: the moment the units actually left stock. */
  fecha: Date;
}

export interface EntradaRecienteInput {
  repuestoId: string;
  cantidad: number;
  precioCompraUnitario: number;
  fecha: Date;
  proveedorNombre: string;
}

export interface OrdenUsoRepuesto {
  id: string;
  estado: EstadoOrden;
  placa: string;
  vehiculo: string;
  cantidad: number;
}

export interface AlertaInventarioRow {
  id: string;
  codigo: string;
  nombre: string;
  stockActual: number;
  stockMinimo: number;
  comprometido: number;
  disponible: number;
  severidad: SeveridadAlerta;
  /** True when open ordenes need more units than are physically in stock. */
  frenaOrdenes: boolean;
  ordenes: OrdenUsoRepuesto[];
  precioCompra: number;
  bodega: { id: string; nombre: string };
  proveedor: ProveedorAlerta | null;
  diasEntrega: number;
  multiploCompra: number;
  /** Stock level the suggested quantity restocks to (stockMaximo, or derived from minimum and demand). */
  objetivoReposicion: number;
  /** Runs out before an order placed today would arrive. */
  seAgotaAntesDeEntrega: boolean;
  /**
   * ISO date while the alert is snoozed ("Posponer"): the card lists it under
   * "Pospuestas" instead of the main lists. It still counts in the resumen,
   * the sidebar badge and the Repuestos page, so those numbers always match.
   */
  pospuestaHasta: string | null;
  /** Units invoiced per week, oldest first, last SEMANAS_TENDENCIA weeks. */
  consumoSemanal: number[];
  consumoDiario: number;
  /** Days until `disponible` runs out at the current pace; null without consumption history. */
  diasCobertura: number | null;
  cantidadSugerida: number;
  costoSugerido: number;
  ultimaCompra: {
    fecha: string;
    cantidad: number;
    precioUnitario: number;
    proveedorNombre: string;
    /** % change vs the previous purchase; null when there is no previous one. */
    variacionPrecioPct: number | null;
  } | null;
}

export interface OrdenFrenada {
  id: string;
  placa: string;
  vehiculo: string;
}

export interface ResumenAlertas {
  total: number;
  sinDisponible: number;
  criticos: number;
  bajoMinimo: number;
  ordenesFrenadas: OrdenFrenada[];
  seAgotanEn7Dias: number;
  costoReposicion: number;
  pospuestas: number;
}

export interface AlertasInventario {
  resumen: ResumenAlertas;
  alertas: AlertaInventarioRow[];
}

export function calcularSeveridad(disponible: number, stockMinimo: number): SeveridadAlerta {
  if (disponible <= 0) return "SIN_DISPONIBLE";
  if (stockMinimo > 0 && disponible / stockMinimo <= 0.5) return "CRITICO";
  return "BAJO_MINIMO";
}

export function consumoPorSemana(items: { cantidad: number; fecha: Date }[], hoy: Date): number[] {
  const semanas = new Array<number>(SEMANAS_TENDENCIA).fill(0);
  for (const item of items) {
    const semanasAtras = Math.floor((hoy.getTime() - item.fecha.getTime()) / (7 * MS_DIA));
    if (semanasAtras >= 0 && semanasAtras < SEMANAS_TENDENCIA) {
      semanas[SEMANAS_TENDENCIA - 1 - semanasAtras] += item.cantidad;
    }
  }
  return semanas;
}

/**
 * Level to restock to: the repuesto's own stockMaximo when set; otherwise
 * enough for 2x the minimum or for lead time + target coverage at the
 * current pace, whichever is larger.
 */
export function calcularObjetivoReposicion(input: {
  stockMinimo: number;
  stockMaximo: number | null;
  consumoDiario: number;
  diasEntrega: number;
}): number {
  if (input.stockMaximo !== null) return input.stockMaximo;
  return Math.max(input.stockMinimo * 2, Math.ceil(input.consumoDiario * (input.diasEntrega + DIAS_COBERTURA_OBJETIVO)));
}

/**
 * Units to order to reach the objetivo from what is free now, rounded up to
 * the proveedor's pack size. Never below one pack: a row only exists because
 * something needs restocking.
 */
export function calcularCantidadSugerida(disponible: number, objetivo: number, multiploCompra: number): number {
  const multiplo = Math.max(1, multiploCompra);
  const faltante = Math.max(1, objetivo - disponible);
  return Math.ceil(faltante / multiplo) * multiplo;
}

function agruparPor<T extends { repuestoId: string }>(items: T[]): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const item of items) {
    const lista = mapa.get(item.repuestoId);
    if (lista) lista.push(item);
    else mapa.set(item.repuestoId, [item]);
  }
  return mapa;
}

/**
 * Builds the alert list: every repuesto whose disponible is at or below its
 * minimum, sorted so rows blocking ordenes come first, then by severity, then
 * by how far below the minimum they sit.
 */
export function construirAlertasInventario(input: {
  repuestos: RepuestoAlertaInput[];
  comprometidos: ItemComprometidoInput[];
  consumidos: ItemConsumidoInput[];
  entradas: EntradaRecienteInput[];
  hoy: Date;
}): AlertasInventario {
  const comprometidosPorRepuesto = agruparPor(input.comprometidos);
  const consumidosPorRepuesto = agruparPor(input.consumidos);
  const entradasPorRepuesto = agruparPor(input.entradas);

  const alertas: AlertaInventarioRow[] = [];
  for (const repuesto of input.repuestos) {
    const items = comprometidosPorRepuesto.get(repuesto.id) ?? [];
    const comprometido = items.reduce((suma, item) => suma + item.cantidad, 0);
    const disponible = repuesto.stockActual - comprometido;
    if (disponible > repuesto.stockMinimo) continue;

    const ordenesPorId = new Map<string, OrdenUsoRepuesto>();
    for (const item of items) {
      const existente = ordenesPorId.get(item.orden.id);
      if (existente) existente.cantidad += item.cantidad;
      else ordenesPorId.set(item.orden.id, { ...item.orden, cantidad: item.cantidad });
    }

    const consumidos = consumidosPorRepuesto.get(repuesto.id) ?? [];
    const consumoDiario = consumidos.reduce((suma, item) => suma + item.cantidad, 0) / DIAS_CONSUMO;
    const diasCobertura = disponible <= 0 ? 0 : consumoDiario > 0 ? Math.floor(disponible / consumoDiario) : null;
    const diasEntrega = repuesto.proveedor?.diasEntrega ?? DIAS_ENTREGA_DEFAULT;
    const objetivoReposicion = calcularObjetivoReposicion({
      stockMinimo: repuesto.stockMinimo,
      stockMaximo: repuesto.stockMaximo,
      consumoDiario,
      diasEntrega,
    });
    const cantidadSugerida = calcularCantidadSugerida(disponible, objetivoReposicion, repuesto.multiploCompra);

    const entradas = [...(entradasPorRepuesto.get(repuesto.id) ?? [])].sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
    const [ultima, anterior] = entradas;

    alertas.push({
      id: repuesto.id,
      codigo: repuesto.codigo,
      nombre: repuesto.nombre,
      stockActual: repuesto.stockActual,
      stockMinimo: repuesto.stockMinimo,
      comprometido,
      disponible,
      severidad: calcularSeveridad(disponible, repuesto.stockMinimo),
      frenaOrdenes: comprometido > repuesto.stockActual,
      ordenes: [...ordenesPorId.values()],
      precioCompra: repuesto.precioCompra,
      bodega: repuesto.bodega,
      proveedor: repuesto.proveedor,
      diasEntrega,
      multiploCompra: repuesto.multiploCompra,
      objetivoReposicion,
      seAgotaAntesDeEntrega: disponible > 0 && diasCobertura !== null && diasCobertura <= diasEntrega,
      pospuestaHasta:
        repuesto.alertaPospuestaHasta && repuesto.alertaPospuestaHasta > input.hoy ? repuesto.alertaPospuestaHasta.toISOString() : null,
      consumoSemanal: consumoPorSemana(consumidos, input.hoy),
      consumoDiario,
      diasCobertura,
      cantidadSugerida,
      costoSugerido: cantidadSugerida * repuesto.precioCompra,
      ultimaCompra: ultima
        ? {
            fecha: ultima.fecha.toISOString(),
            cantidad: ultima.cantidad,
            precioUnitario: ultima.precioCompraUnitario,
            proveedorNombre: ultima.proveedorNombre,
            variacionPrecioPct:
              anterior && anterior.precioCompraUnitario > 0
                ? ((ultima.precioCompraUnitario - anterior.precioCompraUnitario) / anterior.precioCompraUnitario) * 100
                : null,
          }
        : null,
    });
  }

  alertas.sort(
    (a, b) =>
      Number(b.frenaOrdenes) - Number(a.frenaOrdenes) ||
      RANGO_SEVERIDAD[a.severidad] - RANGO_SEVERIDAD[b.severidad] ||
      a.disponible - a.stockMinimo - (b.disponible - b.stockMinimo),
  );

  const ordenesFrenadas = new Map<string, OrdenFrenada>();
  for (const alerta of alertas) {
    if (!alerta.frenaOrdenes) continue;
    for (const orden of alerta.ordenes) {
      ordenesFrenadas.set(orden.id, { id: orden.id, placa: orden.placa, vehiculo: orden.vehiculo });
    }
  }

  return {
    resumen: {
      total: alertas.length,
      sinDisponible: alertas.filter((alerta) => alerta.severidad === "SIN_DISPONIBLE").length,
      criticos: alertas.filter((alerta) => alerta.severidad === "CRITICO").length,
      bajoMinimo: alertas.filter((alerta) => alerta.severidad === "BAJO_MINIMO").length,
      ordenesFrenadas: [...ordenesFrenadas.values()],
      seAgotanEn7Dias: alertas.filter(
        (alerta) => alerta.disponible > 0 && alerta.diasCobertura !== null && alerta.diasCobertura <= 7,
      ).length,
      costoReposicion: alertas.reduce((suma, alerta) => suma + alerta.costoSugerido, 0),
      pospuestas: alertas.filter((alerta) => alerta.pospuestaHasta !== null).length,
    },
    alertas,
  };
}
