import { Prisma } from "@/generated/prisma-tenant";
import { roundMoney } from "./round";

/**
 * Monto como decimal exacto para comparar contra columnas Decimal(10, 2).
 * Un número como 852594.93 es 852594.93000000005… en binario: si Prisma lo
 * envía tal cual, `saldoPendiente >= monto` falla aunque el saldo sea justo
 * 852594.93. Con Decimal se envía el texto "852594.93".
 */
export function montoExacto(valor: number): Prisma.Decimal {
  return new Prisma.Decimal(roundMoney(valor).toFixed(2));
}
