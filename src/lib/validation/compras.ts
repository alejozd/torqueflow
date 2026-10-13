import { z } from "zod";
import { requiredMoney, vacioComoUndefined } from "@/lib/validation/money";

/**
 * Validación de compras (Fase 24): lo que se registra al recibir mercancía y al
 * abonar una cuenta por pagar.
 */

export const MONTO_MAXIMO_COMPRA = 999_999_999.99;

export const abonoProveedorSchema = z.object({
  cuentaId: z.string().trim().min(1, "Falta la cuenta"),
  monto: requiredMoney("El monto es obligatorio")
    .refine((valor) => valor > 0, "El monto debe ser mayor que cero")
    .refine((valor) => valor <= MONTO_MAXIMO_COMPRA, "El monto es demasiado alto"),
  metodoPago: z.enum(["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"], { error: "Elige cómo se pagó" }),
  referencia: z.preprocess(vacioComoUndefined, z.string().trim().max(120).optional()),
});

/** Al registrar una entrada se decide si la deuda nace saldada (pago al contado). */
export const pagoAlContadoSchema = z.preprocess((v) => v === "true" || v === true, z.boolean());

export type AbonoProveedorInput = z.infer<typeof abonoProveedorSchema>;
