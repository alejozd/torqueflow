import { z } from "zod";

export const vehiculoInputSchema = z.object({
  placa: z.string().min(1, "La placa es obligatoria"),
  marca: z.string().min(1, "La marca es obligatoria"),
  modelo: z.string().min(1, "El modelo es obligatorio"),
  anio: z.coerce.number().int().min(1900).max(2100).optional(),
});

export type VehiculoInput = z.infer<typeof vehiculoInputSchema>;
