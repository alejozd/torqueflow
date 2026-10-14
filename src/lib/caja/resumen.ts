import { roundMoney } from "@/lib/money/round";

export type Metodo = "EFECTIVO" | "TARJETA" | "TRANSFERENCIA" | "OTRO";

export interface MovimientosCaja {
  pagos: { monto: number; metodo: Metodo }[]; // pagos de facturas (sin ANTICIPO)
  /// Fase 24: ventas de mostrador cobradas en la ventana (ingreso, igual que un pago).
  ventasMostrador: { monto: number; metodo: Metodo }[];
  anticipos: { monto: number; metodo: Metodo }[]; // anticipos recibidos en la ventana
  /// Anticipos devueltos **y** devoluciones de ventas de mostrador en la ventana
  /// (ambas son dinero que sale del cajón, con el mismo trato).
  devoluciones: { monto: number; metodo: Metodo }[];
  gastosEfectivo: number[]; // montos de gastos pagadoEnEfectivo
  /// Fase 24: abonos a proveedores pagados en efectivo (sale del cajón).
  pagosProveedorEfectivo: number[];
}

export interface ResumenCaja {
  ingresosPorMetodo: Record<Metodo, number>; // pagos + anticipos
  egresosEfectivo: number; // devoluciones en EFECTIVO + gastos en efectivo
  devolucionesOtrosMetodos: number; // devoluciones no-efectivo (informativo)
  efectivoEsperado: number; // base + ingresos EFECTIVO - egresosEfectivo
  totalIngresos: number;
}

export function calcularResumenCaja(baseInicial: number, movimientos: MovimientosCaja): ResumenCaja {
  const ingresosPorMetodo: Record<Metodo, number> = { EFECTIVO: 0, TARJETA: 0, TRANSFERENCIA: 0, OTRO: 0 };
  let totalIngresos = 0;
  for (const m of [...movimientos.pagos, ...movimientos.ventasMostrador, ...movimientos.anticipos]) {
    ingresosPorMetodo[m.metodo] = roundMoney(ingresosPorMetodo[m.metodo] + m.monto);
    totalIngresos = roundMoney(totalIngresos + m.monto);
  }

  let egresosEfectivo = 0;
  let devolucionesOtrosMetodos = 0;
  for (const d of movimientos.devoluciones) {
    if (d.metodo === "EFECTIVO") egresosEfectivo = roundMoney(egresosEfectivo + d.monto);
    else devolucionesOtrosMetodos = roundMoney(devolucionesOtrosMetodos + d.monto);
  }
  for (const g of movimientos.gastosEfectivo) egresosEfectivo = roundMoney(egresosEfectivo + g);
  for (const p of movimientos.pagosProveedorEfectivo) egresosEfectivo = roundMoney(egresosEfectivo + p);

  const efectivoEsperado = roundMoney(baseInicial + ingresosPorMetodo.EFECTIVO - egresosEfectivo);
  return { ingresosPorMetodo, egresosEfectivo, devolucionesOtrosMetodos, efectivoEsperado, totalIngresos };
}

export function diferenciaCierre(
  esperado: number,
  contado: number,
): { diferencia: number; tipo: "CUADRA" | "SOBRANTE" | "FALTANTE" } {
  const diferencia = roundMoney(contado - esperado);
  return { diferencia, tipo: diferencia === 0 ? "CUADRA" : diferencia > 0 ? "SOBRANTE" : "FALTANTE" };
}

export interface CajaCerradaFila {
  id: string;
  abiertaAt: Date;
  cerradaAt: Date;
  abrioPorNombre: string;
  cerroPorNombre: string;
  baseInicial: number;
  esperado: number;
  contado: number;
  diferencia: number;
  tipo: "CUADRA" | "SOBRANTE" | "FALTANTE";
  notas: string | null;
}

/** Una sesión de caja cerrada como fila del historial (pantalla y exportación). */
export function filaCajaCerrada(caja: {
  id: string;
  abiertaAt: Date;
  cerradaAt: Date | null;
  baseInicial: { toString(): string } | number;
  efectivoEsperado: { toString(): string } | number | null;
  efectivoContado: { toString(): string } | number | null;
  notas: string | null;
  abiertaPor: { nombre: string };
  cerradaPor: { nombre: string } | null;
}): CajaCerradaFila {
  const esperado = Number(caja.efectivoEsperado ?? 0);
  const contado = Number(caja.efectivoContado ?? 0);
  const { diferencia, tipo } = diferenciaCierre(esperado, contado);
  return {
    id: caja.id,
    abiertaAt: caja.abiertaAt,
    cerradaAt: caja.cerradaAt as Date,
    abrioPorNombre: caja.abiertaPor.nombre,
    cerroPorNombre: caja.cerradaPor?.nombre ?? "—",
    baseInicial: Number(caja.baseInicial),
    esperado,
    contado,
    diferencia,
    tipo,
    notas: caja.notas,
  };
}
