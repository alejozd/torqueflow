import { z } from "zod";

export const historialInputSchema = z.object({
  descripcion: z.string().min(1, "La descripción es obligatoria"),
});

export type HistorialInput = z.infer<typeof historialInputSchema>;
