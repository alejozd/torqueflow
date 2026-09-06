import { z } from "zod";

/**
 * Same datetime-local handling as citaInputSchema (src/lib/validation/cita.ts):
 * the <input type="datetime-local"> value carries no UTC offset, so it is
 * validated/parsed by hand (Date.parse + refine + transform) rather than with
 * z.coerce.date(), and the fixed America/Bogota offset is appended explicitly
 * so the instant is unambiguous regardless of where the server runs.
 */
const OFFSET_TALLER = "-05:00"; // America/Bogota, sin horario de verano

/** Mirrors the TipoSeguimiento enum in prisma/tenant/schema.prisma. */
export const tipoSeguimientoSchema = z.enum(["LLAMADA", "WHATSAPP", "EMAIL", "VISITA", "NOTA"], {
  message: "Selecciona el tipo de seguimiento",
});

export type TipoSeguimientoInput = z.infer<typeof tipoSeguimientoSchema>;

export const registrarSeguimientoInputSchema = z.object({
  tipo: tipoSeguimientoSchema,
  fecha: z
    .string()
    .min(1, "La fecha es obligatoria")
    .refine((valor) => !Number.isNaN(Date.parse(valor)), "La fecha no es válida")
    .transform((valor) => new Date(`${valor}${OFFSET_TALLER}`)),
  resultado: z.string().min(1, "El resultado es obligatorio").max(1000, "El resultado es demasiado largo"),
  // Optional plain <input type="date">. Unlike crearCotizacionInputSchema's validaHasta
  // (z.coerce.date(), which parses "YYYY-MM-DD" as UTC midnight and therefore renders one
  // day early once formatted in America/Bogota), this field anchors to Bogota midnight
  // explicitly -- callers pass `formData.get("proximoSeguimiento") || undefined` so an
  // untouched/empty field never reaches the schema as "".
  proximoSeguimiento: z
    .string()
    .refine((valor) => !Number.isNaN(Date.parse(valor)), "La fecha de próximo seguimiento no es válida")
    .transform((valor) => new Date(`${valor}T00:00:00${OFFSET_TALLER}`))
    .optional(),
});

export type RegistrarSeguimientoInput = z.infer<typeof registrarSeguimientoInputSchema>;
