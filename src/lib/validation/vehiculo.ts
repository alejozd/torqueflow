import { z } from "zod";

export const tipoCombustibleSchema = z.enum(["GASOLINA", "DIESEL", "HIBRIDO", "ELECTRICO"]);
export const tipoTransmisionSchema = z.enum(["AUTOMATICA", "MECANICA"]);

export const vehiculoInputSchema = z.object({
  placa: z.string().min(1, "La placa es obligatoria"),
  marca: z.string().min(1, "La marca es obligatoria"),
  modelo: z.string().min(1, "El modelo es obligatorio"),
  // Optional catalog references (MarcaVehiculo/ModeloVehiculo) alongside the
  // required free-text marca/modelo above -- see prisma/tenant/schema.prisma's
  // Vehiculo model comment for why both coexist during the gradual migration.
  marcaId: z.string().optional(),
  modeloId: z.string().optional(),
  color: z.string().optional(),
  anio: z.coerce.number().int().min(1900).max(2100).optional(),
  combustible: tipoCombustibleSchema.optional(),
  kilometraje: z.coerce.number().int().min(0, "El kilometraje no puede ser negativo").optional(),
  proximoMantenimiento: z.coerce.date().optional(),
  transmision: tipoTransmisionSchema.optional(),
  observaciones: z.string().optional(),
});

export type VehiculoInput = z.infer<typeof vehiculoInputSchema>;
