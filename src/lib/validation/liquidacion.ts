import { z } from "zod";
import { vacioComoUndefined } from "./money";
import { fechaSchema } from "./reporte";

/** Techo de los montos de una liquidación o de su ajuste (Decimal(10,2)). */
export const MONTO_MAXIMO_LIQUIDACION = 99_999_999.99;

/** Cada cuánto liquida el taller (D5): ajuste del taller, no de cada técnico. */
export const frecuenciaLiquidacionSchema = z.enum(["SEMANAL", "QUINCENAL", "MENSUAL"], {
  error: "Frecuencia inválida",
});
export type FrecuenciaLiquidacionInput = z.infer<typeof frecuenciaLiquidacionSchema>;

/**
 * Un periodo se guarda como string canónico, y su forma depende de la
 * frecuencia del taller: `2026-10` (mensual), `2026-10-Q2` (quincenal) o
 * `2026-W42` (semanal ISO). Cada liquidación conserva su frecuencia, así que
 * cambiar el ajuste del taller no reinterpreta lo ya liquidado.
 */
const PERIODO_POR_FRECUENCIA: Record<FrecuenciaLiquidacionInput, { regex: RegExp; mensaje: string }> = {
  MENSUAL: { regex: /^\d{4}-(0[1-9]|1[0-2])$/, mensaje: "El periodo debe tener el formato AAAA-MM" },
  QUINCENAL: {
    regex: /^\d{4}-(0[1-9]|1[0-2])-Q[12]$/,
    mensaje: "El periodo debe tener el formato AAAA-MM-Q1 o AAAA-MM-Q2",
  },
  SEMANAL: { regex: /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/, mensaje: "El periodo debe tener el formato AAAA-Wnn (semana ISO)" },
};

export function esPeriodoDeFrecuencia(frecuencia: FrecuenciaLiquidacionInput, periodo: string): boolean {
  return PERIODO_POR_FRECUENCIA[frecuencia].regex.test(periodo);
}

export const periodoLiquidacionInputSchema = z
  .object({
    frecuencia: frecuenciaLiquidacionSchema,
    periodo: z.string().trim().min(1, "Selecciona un periodo"),
  })
  .superRefine((datos, ctx) => {
    const esperado = PERIODO_POR_FRECUENCIA[datos.frecuencia];
    if (!esperado.regex.test(datos.periodo)) {
      ctx.addIssue({ code: "custom", path: ["periodo"], message: esperado.mensaje });
    }
  });

const porcentajeSchema = z.preprocess(
  vacioComoUndefined,
  z.coerce
    .number({ error: "El porcentaje debe ser un número" })
    .min(0, "El porcentaje no puede ser negativo")
    .max(100, "El porcentaje no puede pasar de 100")
    .optional(),
);

const montoFijoSchema = z.preprocess(
  vacioComoUndefined,
  z.coerce
    .number({ error: "El monto base debe ser un número" })
    .min(0, "El monto base no puede ser negativo")
    .max(MONTO_MAXIMO_LIQUIDACION, "El monto base es demasiado alto")
    .optional(),
);

/**
 * Forma de pago de un técnico. Solo exige lo que cada tipo necesita: el campo
 * que no aplica se ignora (la action lo guarda en null), para que cambiar de
 * tipo no obligue a vaciar el otro a mano.
 */
export const esquemaLiquidacionInputSchema = z
  .object({
    tipo: z.enum(["PORCENTAJE", "FIJO", "MIXTO"], { error: "Tipo de esquema inválido" }),
    porcentaje: porcentajeSchema,
    montoFijo: montoFijoSchema,
  })
  .superRefine((datos, ctx) => {
    const pct = datos.porcentaje ?? 0;
    const base = datos.montoFijo ?? 0;
    const usaPorcentaje = datos.tipo === "PORCENTAJE" || datos.tipo === "MIXTO";
    const usaBase = datos.tipo === "FIJO" || datos.tipo === "MIXTO";

    if (datos.tipo === "PORCENTAJE" && datos.porcentaje === undefined) {
      ctx.addIssue({ code: "custom", path: ["porcentaje"], message: "Un esquema por porcentaje necesita el porcentaje" });
    }
    if (datos.tipo === "FIJO" && datos.montoFijo === undefined) {
      ctx.addIssue({ code: "custom", path: ["montoFijo"], message: "Un esquema fijo necesita el monto base" });
    }
    if (datos.tipo === "MIXTO" && (datos.porcentaje === undefined || datos.montoFijo === undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["porcentaje"],
        message: "Un esquema mixto necesita el porcentaje y el monto base",
      });
    }
    if (usaPorcentaje && pct <= 0) {
      ctx.addIssue({ code: "custom", path: ["porcentaje"], message: "El porcentaje debe ser mayor que cero" });
    }
    if (usaBase && base <= 0) {
      ctx.addIssue({ code: "custom", path: ["montoFijo"], message: "El monto base debe ser mayor que cero" });
    }
  });

/** Métodos con los que se puede pagar una liquidación (no hay ANTICIPO aquí). */
export const metodoPagoLiquidacionSchema = z.enum(["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"], {
  error: "Método de pago inválido",
});

export const pagarLiquidacionInputSchema = z.object({
  metodoPago: metodoPagoLiquidacionSchema,
  fecha: fechaSchema,
  referencia: z
    .string()
    .trim()
    .max(60, "La referencia admite máximo 60 caracteres")
    .optional()
    .transform((valor) => (valor ? valor : undefined)),
});

export const ajusteLiquidacionInputSchema = z  .object({
    ajuste: z.preprocess(
      vacioComoUndefined,
      z.coerce
        .number({ error: "El ajuste debe ser un número" })
        .min(-MONTO_MAXIMO_LIQUIDACION, "El ajuste es demasiado alto")
        .max(MONTO_MAXIMO_LIQUIDACION, "El ajuste es demasiado alto"),
    ),
    motivo: z
      .string()
      .trim()
      .max(200, "El motivo admite máximo 200 caracteres")
      .optional()
      .transform((valor) => (valor ? valor : undefined)),
  })
  .superRefine((datos, ctx) => {
    if (datos.ajuste !== 0 && !datos.motivo) {
      ctx.addIssue({ code: "custom", path: ["motivo"], message: "Explica el motivo del ajuste" });
    }
  });

/** Anular una liquidación siempre deja rastro: el motivo es obligatorio. */
export const motivoAnulacionSchema = z
  .string()
  .trim()
  .min(1, "Explica por qué se anula la liquidación")
  .max(200, "El motivo admite máximo 200 caracteres");
