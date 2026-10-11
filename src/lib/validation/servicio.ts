import { z } from "zod";

/**
 * Techo del precio de mano de obra: la columna es Decimal(10,2). El precio 0 es
 * válido a propósito -- un servicio que solo agrupa repuestos (kit sin mano de
 * obra propia), ver D6 del plan de la fase 18.
 */
const PRECIO_MAXIMO = 99_999_999.99;

export const servicioInputSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "El nombre es obligatorio")
    .max(80, "El nombre admite máximo 80 caracteres"),
  descripcion: z
    .string()
    .trim()
    .max(300, "La descripción admite máximo 300 caracteres")
    .optional()
    .transform((valor) => (valor ? valor : undefined)),
  precioManoObra: z.coerce
    .number({ error: "El precio debe ser un número" })
    .min(0, "El precio no puede ser negativo")
    .max(PRECIO_MAXIMO, "El precio es demasiado alto"),
});

export const servicioRepuestoInputSchema = z.object({
  repuestoId: z.string().trim().min(1, "Selecciona un repuesto"),
  cantidad: z.coerce
    .number()
    .int("La cantidad debe ser un número entero")
    .min(1, "La cantidad mínima es 1")
    .max(1000, "La cantidad es demasiado alta"),
});
