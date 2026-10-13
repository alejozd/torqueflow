import { diasDesde, rangoDe, type RangoAntiguedad } from "@/lib/cartera/antiguedad";
import { roundMoney } from "@/lib/money/round";

/**
 * Cuentas por pagar a proveedores (Fase 24, D5): el espejo de la cartera. Reutiliza
 * los mismos tramos de antigüedad que la deuda de clientes para que el taller lea
 * las dos igual, y deja el cálculo fuera de la consulta para poder probarlo.
 */

export interface CuentaPorPagarFila {
  cuentaId: string;
  proveedorId: string;
  proveedorNombre: string;
  entradaId: string;
  fecha: Date;
  total: number;
  saldo: number;
}

export interface CuentaConAntiguedad extends CuentaPorPagarFila {
  dias: number;
  rango: RangoAntiguedad;
}

export interface ProveedorCuentas {
  proveedorId: string;
  proveedorNombre: string;
  saldoTotal: number;
  porRango: Record<RangoAntiguedad, number>;
  cuentas: CuentaConAntiguedad[];
  diasMasAntigua: number;
}

function rangosVacios(): Record<RangoAntiguedad, number> {
  return { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
}

export function agruparCuentasPorPagar(
  cuentas: CuentaPorPagarFila[],
  ahora: Date,
): { proveedores: ProveedorCuentas[]; totales: Record<RangoAntiguedad, number> & { total: number } } {
  const porProveedor = new Map<string, ProveedorCuentas>();
  const totales = { ...rangosVacios(), total: 0 };

  for (const cuenta of cuentas) {
    const dias = diasDesde(cuenta.fecha, ahora);
    const rango = rangoDe(dias);
    let proveedor = porProveedor.get(cuenta.proveedorId);
    if (!proveedor) {
      proveedor = {
        proveedorId: cuenta.proveedorId,
        proveedorNombre: cuenta.proveedorNombre,
        saldoTotal: 0,
        porRango: rangosVacios(),
        cuentas: [],
        diasMasAntigua: 0,
      };
      porProveedor.set(cuenta.proveedorId, proveedor);
    }

    proveedor.saldoTotal = roundMoney(proveedor.saldoTotal + cuenta.saldo);
    proveedor.porRango[rango] = roundMoney(proveedor.porRango[rango] + cuenta.saldo);
    proveedor.cuentas.push({ ...cuenta, dias, rango });
    proveedor.diasMasAntigua = Math.max(proveedor.diasMasAntigua, dias);
    totales[rango] = roundMoney(totales[rango] + cuenta.saldo);
    totales.total = roundMoney(totales.total + cuenta.saldo);
  }

  const proveedores = [...porProveedor.values()].sort((a, b) => b.saldoTotal - a.saldoTotal);
  for (const proveedor of proveedores) proveedor.cuentas.sort((a, b) => b.dias - a.dias);
  return { proveedores, totales };
}
