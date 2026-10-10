import { z } from "zod";
import { MONTO_MAXIMO } from "./gasto";

const baseSchema = z.coerce
  .number({ error: "El monto debe ser un número" })
  .min(0, "La base no puede ser negativa")
  .max(MONTO_MAXIMO, "El monto es demasiado alto");

// ANTICIPO es un método interno (pagos generados al facturar): el usuario no lo elige.
const metodoRealSchema = z.enum(["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"], {
  error: "Selecciona un método de pago",
});

export const abrirCajaInputSchema = z.object({ baseInicial: baseSchema });

export const cerrarCajaInputSchema = z.object({
  efectivoContado: z.coerce
    .number({ error: "El monto debe ser un número" })
    .min(0, "El efectivo contado no puede ser negativo")
    .max(MONTO_MAXIMO, "El monto es demasiado alto"),
  notas: z
    .string()
    .trim()
    .max(300, "Las notas admiten máximo 300 caracteres")
    .optional()
    .transform((v) => v || undefined),
});

export const anticipoInputSchema = z.object({
  monto: z.coerce
    .number({ error: "El monto debe ser un número" })
    .positive("El monto debe ser mayor que cero")
    .max(MONTO_MAXIMO, "El monto es demasiado alto"),
  metodoPago: metodoRealSchema,
  referencia: z
    .string()
    .trim()
    .max(60, "La referencia admite máximo 60 caracteres")
    .optional()
    .transform((v) => v || undefined),
});

export const devolverAnticipoInputSchema = z.object({ metodoDevolucion: metodoRealSchema });

export type AbrirCajaInput = z.infer<typeof abrirCajaInputSchema>;
export type CerrarCajaInput = z.infer<typeof cerrarCajaInputSchema>;
export type AnticipoInput = z.infer<typeof anticipoInputSchema>;
export type DevolverAnticipoInput = z.infer<typeof devolverAnticipoInputSchema>;
