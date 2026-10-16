import { roundMoney } from "@/lib/money/round";

/**
 * «Abonar al proveedor»: un solo pago repartido entre sus entradas por pagar,
 * de la más vieja a la más nueva. Cada entrada recibe hasta saldarse y lo que
 * sobra pasa a la siguiente. El diálogo lo usa para la tabla «Así se reparte» y
 * la acción para crear un abono por cuenta tocada: así los dos reparten igual.
 */

export interface CuentaParaRepartir {
  cuentaId: string;
  /** Fecha de la deuda: manda el orden (la más vieja primero). */
  fecha: Date;
  saldo: number;
}

export interface PorcionAbono {
  cuentaId: string;
  /** Lo que recibe esta entrada (0 si el pago no le alcanza). */
  recibe: number;
  /** Lo que queda debiendo después del abono. */
  queda: number;
}

/** Orden estable: por fecha y, el mismo día, por id (igual que la consulta del servidor). */
export function ordenarParaRepartir<T extends CuentaParaRepartir>(cuentas: T[]): T[] {
  return [...cuentas].sort(
    (a, b) => a.fecha.getTime() - b.fecha.getTime() || (a.cuentaId < b.cuentaId ? -1 : a.cuentaId > b.cuentaId ? 1 : 0),
  );
}

/** Reparte `monto` entre las cuentas (todas aparecen, en orden). No reparte más de lo que se debe. */
export function repartirAbono(cuentas: CuentaParaRepartir[], monto: number): PorcionAbono[] {
  let resto = roundMoney(Math.max(0, monto));
  return ordenarParaRepartir(cuentas).map((cuenta) => {
    const recibe = roundMoney(Math.min(resto, Math.max(0, cuenta.saldo)));
    resto = roundMoney(resto - recibe);
    return { cuentaId: cuenta.cuentaId, recibe, queda: roundMoney(cuenta.saldo - recibe) };
  });
}
