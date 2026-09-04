import { z } from "zod";

export const marcaVehiculoInputSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
});

export type MarcaVehiculoInput = z.infer<typeof marcaVehiculoInputSchema>;

export const modeloVehiculoInputSchema = z.object({
  marcaId: z.string().min(1, "Selecciona una marca"),
  nombre: z.string().min(1, "El nombre es obligatorio"),
});

export type ModeloVehiculoInput = z.infer<typeof modeloVehiculoInputSchema>;
