import { z } from "zod";
import { formatoDiaBogota } from "@/lib/fecha-bogota";

/** "aaaa-mm-dd" o vacío; desde 1900 y nunca en el futuro (día de Bogotá). */
const fechaNacimientoSchema = z
  .string()
  .refine((valor) => valor === "" || /^\d{4}-\d{2}-\d{2}$/.test(valor), "Fecha de nacimiento inválida")
  .refine((valor) => valor === "" || valor >= "1900-01-01", "Fecha de nacimiento inválida")
  .refine(
    (valor) => valor === "" || valor <= formatoDiaBogota.format(new Date()),
    "La fecha de nacimiento no puede ser futura",
  );

export const clienteInputSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  telefono: z.string().optional().or(z.literal("")),
  email: z.email("Correo inválido").optional().or(z.literal("")),
  documento: z.string().optional().or(z.literal("")),
  fechaNacimiento: fechaNacimientoSchema.optional(),
});

export type ClienteInput = z.infer<typeof clienteInputSchema>;

/**
 * "aaaa-mm-dd" → Date a medianoche UTC (columna @db.Date); "" → null (se borra);
 * ausente → undefined (Prisma no toca la columna).
 */
export function fechaNacimientoADate(valor: string | undefined): Date | null | undefined {
  if (valor === undefined) return undefined;
  return valor ? new Date(`${valor}T00:00:00.000Z`) : null;
}
