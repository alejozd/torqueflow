import { diasDesde, rangoDe, type RangoAntiguedad } from "@/lib/cartera/antiguedad";
import { roundMoney } from "@/lib/money/round";

/**
 * Cuentas por pagar a proveedores (Fase 24, D5): el espejo de la cartera. Reutiliza
 * los mismos tramos de antigüedad que la deuda de clientes para que el taller lea
 * las dos igual, y deja el cálculo fuera de la consulta para poder probarlo.
 */

/** Un abono ya registrado a la cuenta, para el historial de la fila. */
export interface PagoCuentaFila {
  id: string;
  monto: number;
  metodoPago: string;
  referencia: string | null;
  /** Nombre de quien lo registró. */
  registradoPor: string;
  createdAt: Date;
}

/** Lo que se compró en la entrada, en una línea: para saber de qué es la deuda. */
export interface EntradaResumen {
  id: string;
  /** Cuántos repuestos distintos trajo la entrada. */
  referencias: number;
  /** «Batería NGK ×20, Aceite 5W-30 ×6 y 1 más». */
  resumen: string;
}

export interface CuentaPorPagarFila {
  cuentaId: string;
  proveedorId: string;
  proveedorNombre: string;
  entradaId: string;
  fecha: Date;
  total: number;
  saldo: number;
  /** total − saldo: lo que ya se le abonó a esta entrada. */
  pagado: number;
  entrada: EntradaResumen;
  /** Del abono más reciente al más viejo. */
  pagos: PagoCuentaFila[];
}

/** Cuántos ítems se nombran en el resumen de la entrada; el resto va como «y N más». */
const ITEMS_EN_RESUMEN = 2;

/**
 * Resume los ítems de una entrada: junta las líneas del mismo repuesto (una
 * entrada suelta puede traer dos veces el mismo) y nombra los de mayor cantidad.
 */
export function resumirEntrada(
  items: { repuestoId: string; nombre: string; cantidad: number }[],
): { referencias: number; resumen: string } {
  const porRepuesto = new Map<string, { nombre: string; cantidad: number }>();
  for (const item of items) {
    const previo = porRepuesto.get(item.repuestoId);
    if (previo) previo.cantidad += item.cantidad;
    else porRepuesto.set(item.repuestoId, { nombre: item.nombre, cantidad: item.cantidad });
  }

  const ordenados = [...porRepuesto.values()].sort(
    (a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre, "es"),
  );
  const nombrados = ordenados.slice(0, ITEMS_EN_RESUMEN).map((item) => `${item.nombre} ×${item.cantidad}`);
  const resto = ordenados.length - nombrados.length;
  if (nombrados.length === 0) return { referencias: 0, resumen: "Sin ítems" };
  return {
    referencias: ordenados.length,
    resumen: resto > 0 ? `${nombrados.join(", ")} y ${resto} más` : nombrados.join(", "),
  };
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
