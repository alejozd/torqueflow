import { formatoDiaBogota } from "@/lib/fecha-bogota";
import { roundMoney } from "@/lib/money/round";

export type RangoAntiguedad = "0-30" | "31-60" | "61-90" | "90+";

/** Cliente sintético para las ventas de mostrador a crédito sin cliente. */
export const CONSUMIDOR_FINAL_ID = "consumidor-final";

export type OrigenCartera = "FACTURA" | "MOSTRADOR";

export interface FacturaCartera {
  /** Id del documento: la factura o la venta de mostrador (según `origen`). */
  facturaId: string;
  /** Sin `origen` se entiende FACTURA (compatibilidad con quien arma solo facturas). */
  origen?: OrigenCartera;
  numero: number;
  clienteId: string;
  clienteNombre: string;
  clienteTelefono: string | null;
  emitidaAt: Date;
  total: number;
  saldo: number;
}

export interface ClienteCartera {
  clienteId: string;
  clienteNombre: string;
  clienteTelefono: string | null;
  saldoTotal: number;
  porRango: Record<RangoAntiguedad, number>;
  facturas: (FacturaCartera & { dias: number; rango: RangoAntiguedad })[];
  diasMasAntigua: number;
}

const MS_DIA = 24 * 60 * 60 * 1000;

function rangosVacios(): Record<RangoAntiguedad, number> {
  return { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
}

/** Días calendario de Bogotá entre la emisión y ahora; nunca negativo. */
export function diasDesde(emitidaAt: Date, ahora: Date): number {
  const a = Date.parse(`${formatoDiaBogota.format(emitidaAt)}T00:00:00Z`);
  const b = Date.parse(`${formatoDiaBogota.format(ahora)}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / MS_DIA));
}

export function rangoDe(dias: number): RangoAntiguedad {
  if (dias <= 30) return "0-30";
  if (dias <= 60) return "31-60";
  if (dias <= 90) return "61-90";
  return "90+";
}

export function agruparCartera(
  facturas: FacturaCartera[],
  ahora: Date,
): { clientes: ClienteCartera[]; totales: Record<RangoAntiguedad, number> & { total: number } } {
  const porCliente = new Map<string, ClienteCartera>();
  const totales = { ...rangosVacios(), total: 0 };

  for (const f of facturas) {
    const dias = diasDesde(f.emitidaAt, ahora);
    const rango = rangoDe(dias);
    let c = porCliente.get(f.clienteId);
    if (!c) {
      c = {
        clienteId: f.clienteId,
        clienteNombre: f.clienteNombre,
        clienteTelefono: f.clienteTelefono,
        saldoTotal: 0,
        porRango: rangosVacios(),
        facturas: [],
        diasMasAntigua: 0,
      };
      porCliente.set(f.clienteId, c);
    }
    c.saldoTotal = roundMoney(c.saldoTotal + f.saldo);
    c.porRango[rango] = roundMoney(c.porRango[rango] + f.saldo);
    c.facturas.push({ ...f, dias, rango });
    c.diasMasAntigua = Math.max(c.diasMasAntigua, dias);
    totales[rango] = roundMoney(totales[rango] + f.saldo);
    totales.total = roundMoney(totales.total + f.saldo);
  }

  const clientes = [...porCliente.values()].sort((x, y) => y.saldoTotal - x.saldoTotal);
  for (const c of clientes) c.facturas.sort((x, y) => y.dias - x.dias);
  return { clientes, totales };
}
