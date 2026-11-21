// src/modulos/factura-electronica/dinero.ts
import type { Centavos } from "./modelo";

/** 119000000 → "1190000.00". Solo acepta enteros no negativos. */
export function aTextoDecimal(centavos: Centavos): string {
  if (!Number.isInteger(centavos)) {
    throw new Error(`Se esperaban centavos enteros y llegó ${centavos}`);
  }
  const signo = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  const pesos = Math.trunc(abs / 100);
  const resto = String(abs % 100).padStart(2, "0");
  return `${signo}${pesos}.${resto}`;
}
