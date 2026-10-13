import { z } from "zod";
import { vacioComoUndefined } from "./money";
import { fechaSchema } from "./reporte";

/**
 * Validación de la Fase 21: recepción del vehículo, marcas del diagrama de
 * daños, acta de entrega con su firma y garantías registradas.
 *
 * Los archivos (la firma dibujada en pantalla y la foto del acta firmada) no
 * viajan como URL: la acción los guarda con el storage de la orden y valida
 * aquí, sobre las URL resultantes, que haya **exactamente una** firma (D5).
 */

/** Techo de kilometraje: por encima de esto es un dedazo, no una lectura. */
export const KM_MAXIMO = 9_999_999;

export const nivelCombustibleSchema = z.enum(["VACIO", "CUARTO", "MEDIO", "TRES_CUARTOS", "LLENO"]);

export const zonaVehiculoSchema = z.enum([
  "FRENTE",
  "CAPO",
  "PARABRISAS",
  "TECHO",
  "LATERAL_DERECHO",
  "LATERAL_IZQUIERDO",
  "PUERTA_DERECHA",
  "PUERTA_IZQUIERDA",
  "GUARDABARROS_DERECHO",
  "GUARDABARROS_IZQUIERDO",
  "COMPUERTA",
  "RINES",
  "ESPEJO_DERECHO",
  "ESPEJO_IZQUIERDO",
  "MANUBRIO",
  "TANQUE",
  "ASIENTO",
  "OTRO",
]);

export const tipoDanioSchema = z.enum(["GOLPE", "RAYON", "ROTURA", "FALTANTE", "OXIDO"]);

export const tipoGarantiaSchema = z.enum(["TRABAJO", "REPUESTO"]);

export const recepcionInputSchema = z.object({
  kilometrajeIngreso: z.preprocess(
    vacioComoUndefined,
    z.coerce
      .number({ error: "El kilometraje debe ser un número" })
      .int("Usa un número entero")
      .min(0, "El kilometraje no puede ser negativo")
      .max(KM_MAXIMO, "Ese kilometraje es demasiado alto")
      .optional(),
  ),
  nivelCombustible: z.preprocess(vacioComoUndefined, nivelCombustibleSchema.optional()),
});

export type RecepcionInput = z.infer<typeof recepcionInputSchema>;

export const danioInputSchema = z.object({
  zona: zonaVehiculoSchema,
  tipo: tipoDanioSchema,
  nota: z
    .string()
    .trim()
    .max(200, "La nota admite máximo 200 caracteres")
    .optional()
    .transform((valor) => (valor ? valor : undefined)),
});

export type DanioInput = z.infer<typeof danioInputSchema>;

const documentoRecibeSchema = z
  .string()
  .trim()
  .max(40, "El documento admite máximo 40 caracteres")
  .optional()
  .transform((valor) => (valor ? valor : undefined));

const observacionesSchema = z
  .string()
  .trim()
  .max(500, "Las observaciones admiten máximo 500 caracteres")
  .optional()
  .transform((valor) => (valor ? valor : undefined));

/** Datos del acta que se pueden guardar sin firma (borrador de entrega). */
export const actaDatosSchema = z.object({
  recibidoPor: z
    .string()
    .trim()
    .min(1, "Escribe el nombre de quien recibe")
    .max(120, "El nombre admite máximo 120 caracteres"),
  documentoRecibe: documentoRecibeSchema,
  observaciones: observacionesSchema,
});

export const actaEntregaInputSchema = actaDatosSchema
  .extend({
    /** Firma dibujada en pantalla (PNG ya guardado por la acción). */
    firmaUrl: z.preprocess(vacioComoUndefined, z.string().trim().min(1).optional()),
    /** Foto o escaneo del acta firmada en papel (ya guardado por la acción). */
    firmaFotoUrl: z.preprocess(vacioComoUndefined, z.string().trim().min(1).optional()),
  })
  .superRefine((datos, ctx) => {
    const firmas = [datos.firmaUrl, datos.firmaFotoUrl].filter(Boolean).length;
    if (firmas === 0) {
      ctx.addIssue({ code: "custom", path: ["firmaUrl"], message: "Falta la firma de quien recibe" });
    }
    if (firmas > 1) {
      ctx.addIssue({ code: "custom", path: ["firmaUrl"], message: "Deja solo una firma: la de pantalla o la foto" });
    }
  });

export type ActaDatosInput = z.infer<typeof actaDatosSchema>;
export type ActaEntregaInput = z.infer<typeof actaEntregaInputSchema>;

/** El acta y la entrega comparten contrato: entregar es firmar y cerrar (D6). */
export const entregaInputSchema = actaEntregaInputSchema;

export const garantiaInputSchema = z
  .object({
    tipo: tipoGarantiaSchema,
    // Un campo vacío del formulario llega como "": sin esto, Zod contestaría en
    // inglés antes de que el superRefine explique cuál línea falta.
    manoDeObraId: z.preprocess(vacioComoUndefined, z.string().trim().min(1).optional()),
    itemOrdenId: z.preprocess(vacioComoUndefined, z.string().trim().min(1).optional()),
    descripcion: z
      .string()
      .trim()
      .min(1, "Escribe qué cubre la garantía")
      .max(200, "La descripción admite máximo 200 caracteres"),
    cubreHasta: z.preprocess(vacioComoUndefined, fechaSchema.optional()),
    cubreHastaKm: z.preprocess(
      vacioComoUndefined,
      z.coerce
        .number({ error: "El kilometraje debe ser un número" })
        .int("Usa un número entero")
        .min(0, "El kilometraje no puede ser negativo")
        .max(KM_MAXIMO, "Ese kilometraje es demasiado alto")
        .optional(),
    ),
    nota: z
      .string()
      .trim()
      .max(300, "La nota admite máximo 300 caracteres")
      .optional()
      .transform((valor) => (valor ? valor : undefined)),
  })
  .superRefine((datos, ctx) => {
    // Un trabajo se cubre por su línea de mano de obra y un repuesto por su
    // línea de ítem: el tipo decide cuál de las dos referencias es obligatoria.
    if (datos.tipo === "TRABAJO" && !datos.manoDeObraId) {
      ctx.addIssue({ code: "custom", path: ["manoDeObraId"], message: "Elige el trabajo que cubre la garantía" });
    }
    if (datos.tipo === "REPUESTO" && !datos.itemOrdenId) {
      ctx.addIssue({ code: "custom", path: ["itemOrdenId"], message: "Elige el repuesto que cubre la garantía" });
    }
  });

export type GarantiaInput = z.infer<typeof garantiaInputSchema>;
