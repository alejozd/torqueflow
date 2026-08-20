import { z } from "zod";

export const ordenTrabajoInputSchema = z.object({
  mecanicoId: z.string().optional().or(z.literal("")),
  kilometrajeIngreso: z.coerce.number().int().min(0, "El kilometraje no puede ser negativo").optional(),
  sintomas: z.string().optional().or(z.literal("")),
});

export type OrdenTrabajoInput = z.infer<typeof ordenTrabajoInputSchema>;

export const itemOrdenInputSchema = z.object({
  descripcion: z.string().min(1, "La descripción es obligatoria"),
  cantidad: z.coerce.number().int().min(1, "La cantidad debe ser al menos 1"),
  precioUnitario: z.coerce.number().min(0, "El precio no puede ser negativo"),
});

export type ItemOrdenInput = z.infer<typeof itemOrdenInputSchema>;

export const manoDeObraInputSchema = z.object({
  descripcion: z.string().min(1, "La descripción es obligatoria"),
  horas: z.coerce.number().min(0.1, "Las horas deben ser mayores a 0"),
  precioHora: z.coerce.number().min(0, "El precio no puede ser negativo"),
});

export type ManoDeObraInput = z.infer<typeof manoDeObraInputSchema>;

export const estadoOrdenSchema = z.enum(["BORRADOR", "EN_PROCESO", "TERMINADA", "ENTREGADA", "ANULADA"]);
