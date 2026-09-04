import { z } from "zod";

export const tipoCombustibleSchema = z.enum(["GASOLINA", "DIESEL", "HIBRIDO", "ELECTRICO"]);
export const tipoTransmisionSchema = z.enum(["AUTOMATICA", "MECANICA"]);

export const vehiculoInputSchema = z.object({
  placa: z.string().min(1, "La placa es obligatoria"),
  marca: z.string().min(1, "La marca es obligatoria"),
  modelo: z.string().min(1, "El modelo es obligatorio"),
  color: z.string().optional(),
  anio: z.coerce.number().int().min(1900).max(2100).optional(),
  combustible: tipoCombustibleSchema.optional(),
  kilometraje: z.coerce.number().int().min(0, "El kilometraje no puede ser negativo").optional(),
  proximoMantenimiento: z.coerce.date().optional(),
  transmision: tipoTransmisionSchema.optional(),
  observaciones: z.string().optional(),
});

export type VehiculoInput = z.infer<typeof vehiculoInputSchema>;
