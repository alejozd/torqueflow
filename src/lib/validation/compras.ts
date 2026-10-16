import { z } from "zod";
import { requiredMoney, vacioComoUndefined } from "@/lib/validation/money";

/**
 * Validación de compras (Fase 24): lo que se registra al abonar una cuenta por
 * pagar. La deuda la crea la entrada de mercancía (D5), así que aquí no hay
 * formulario de entrada: por eso no hay validación de "pagado al contado".
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

export type AbonoProveedorInput = z.infer<typeof abonoProveedorSchema>;

/** «Abonar al proveedor»: un pago que se reparte entre sus entradas, de la más vieja a la más nueva. */
export const abonoAProveedorSchema = abonoProveedorSchema.omit({ cuentaId: true }).extend({
  proveedorId: z.string().trim().min(1, "Falta el proveedor"),
});
