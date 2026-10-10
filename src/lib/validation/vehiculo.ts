import { z } from "zod";

export const tipoCombustibleSchema = z.enum(["GASOLINA", "DIESEL", "HIBRIDO", "ELECTRICO"]);
export const tipoTransmisionSchema = z.enum(["AUTOMATICA", "MECANICA"]);

export const tipoVehiculoSchema = z.enum(["CARRO", "MOTO", "CAMIONETA", "CAMION"]);
export type TipoVehiculoValor = z.infer<typeof tipoVehiculoSchema>;

export const MENSAJE_VIN_INVALIDO = "El VIN debe tener 17 caracteres (letras y números, sin I, O ni Q)";
const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

const vinSchema = z
  .string()
  .transform((valor) => valor.replace(/\s+/g, "").toUpperCase())
  .refine((valor) => VIN_REGEX.test(valor), MENSAJE_VIN_INVALIDO);

/**
 * Formato habitual de placa colombiana según el tipo. Solo alimenta un aviso
 * NO bloqueante en el formulario: placas antiguas, diplomáticas o de remolque
 * no siguen el patrón y deben poder guardarse igual.
 */
export function placaFormatoHabitual(placa: string, tipo: TipoVehiculoValor): boolean {
  const normalizada = placa.replace(/[\s-]/g, "").toUpperCase();
  return tipo === "MOTO" ? /^[A-Z]{3}\d{2}[A-Z]$/.test(normalizada) : /^[A-Z]{3}\d{3}$/.test(normalizada);
}

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
  tipo: tipoVehiculoSchema.default("CARRO"),
  vin: vinSchema.optional(),
  soatVence: z.coerce.date().optional(),
  tecnomecanicaVence: z.coerce.date().optional(),
});

export type VehiculoInput = z.infer<typeof vehiculoInputSchema>;
