import { z } from "zod";

/**
 * Techo del precio de mano de obra: la columna es Decimal(10,2). El precio 0 es
 * válido a propósito -- un servicio que solo agrupa repuestos (kit sin mano de
 * obra propia), ver D6 del plan de la fase 18.
 */
const PRECIO_MAXIMO = 99_999_999.99;

/**
 * Tope de unidades de un repuesto dentro de un kit. No es solo el máximo de una
 * línea: el alta suma cantidades cuando el repuesto ya está en el kit, así que
 * el tope se comprueba también sobre el acumulado (ver
 * agregarRepuestoAServicioAction).
 */
export const CANTIDAD_MAXIMA_KIT = 1000;

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
    .max(CANTIDAD_MAXIMA_KIT, "La cantidad es demasiado alta"),
});

/** Servicio elegido en el selector de "aplicar a la orden / cotización". */
export const aplicarServicioInputSchema = z.object({
  servicioId: z.string().trim().min(1, "Selecciona un servicio"),
});

/**
 * `listServicios` es una server action exportada: sus opciones las elige quien
 * llama, así que se validan en vez de confiar en cualquier valor "truthy" (de
 * ellas depende qué rol se exige).
 */
export const listarServiciosInputSchema = z.object({
  soloActivos: z.boolean().optional(),
});
