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
