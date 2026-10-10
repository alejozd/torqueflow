import { z } from "zod";
import { fechaSchema } from "./reporte";

export const MONTO_MAXIMO = 9_999_999_999.99;

const montoSchema = z.coerce
  .number({ error: "El monto debe ser un número" })
  .positive("El monto debe ser mayor que cero")
  .max(MONTO_MAXIMO, "El monto es demasiado alto");

const categoriaIdSchema = z.string().trim().min(1, "Selecciona una categoría");

const descripcionSchema = z
  .string()
  .trim()
  .min(1, "La descripción es obligatoria")
  .max(200, "La descripción admite máximo 200 caracteres");

export const periodoSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "El periodo debe tener el formato AAAA-MM");

export const gastoInputSchema = z.object({
  categoriaId: categoriaIdSchema,
  descripcion: descripcionSchema,
  monto: montoSchema,
  fecha: fechaSchema,
  referencia: z
    .string()
    .trim()
    .max(60, "La referencia admite máximo 60 caracteres")
    .optional()
    .transform((valor) => (valor ? valor : undefined)),
  sedeId: z.string().trim().optional(),
});

export const gastoRecurrenteInputSchema = z.object({
  categoriaId: categoriaIdSchema,
  descripcion: descripcionSchema,
  montoEstimado: montoSchema,
  diaDelMes: z.coerce
    .number({ error: "El día debe estar entre 1 y 28" })
    .int("El día debe estar entre 1 y 28")
    .min(1, "El día debe estar entre 1 y 28")
    .max(28, "El día debe estar entre 1 y 28"),
  desde: periodoSchema,
  sedeId: z.string().trim().optional(),
});

export const categoriaGastoInputSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(60, "El nombre admite máximo 60 caracteres"),
});

export const confirmarRecurrenteInputSchema = z.object({
  monto: montoSchema,
  fecha: fechaSchema,
});
