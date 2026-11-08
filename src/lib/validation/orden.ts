import { z } from "zod";

export const ordenTrabajoInputSchema = z.object({
  mecanicoId: z.string().optional().or(z.literal("")),
  kilometrajeIngreso: z.coerce.number().int().min(0, "El kilometraje no puede ser negativo").optional(),
  sintomas: z.string().optional().or(z.literal("")),
});

export type OrdenTrabajoInput = z.infer<typeof ordenTrabajoInputSchema>;

export const estadoOrdenSchema = z.enum(["BORRADOR", "EN_PROCESO", "TERMINADA", "ENTREGADA", "ANULADA"]);

/** Fase 22: prioridad de la orden (qué va primero en el taller). */
export const prioridadOrdenSchema = z.enum(["BAJA", "NORMAL", "ALTA", "URGENTE"]);

export const PRIORIDAD_ORDEN_POR_DEFECTO = "NORMAL" as const;

/** Fase 22: umbral de días sin actividad para considerar una orden estancada. */
export const DIAS_ESTANCADA_MIN = 1;
export const DIAS_ESTANCADA_MAX = 90;

const MENSAJE_DIAS_ESTANCADA = `Ingresa un número de días entre ${DIAS_ESTANCADA_MIN} y ${DIAS_ESTANCADA_MAX}`;

export const diasEstancadaSchema = z.coerce
  .number({ error: MENSAJE_DIAS_ESTANCADA })
  .int(MENSAJE_DIAS_ESTANCADA)
  .min(DIAS_ESTANCADA_MIN, MENSAJE_DIAS_ESTANCADA)
  .max(DIAS_ESTANCADA_MAX, MENSAJE_DIAS_ESTANCADA);

/** Una línea libre que se agrega desde el buscador de la orden. */
export const libreOrdenInputSchema = z.object({
  tipo: z.enum(["REPUESTO", "MANO_OBRA"]),
  descripcion: z.string().trim().min(1, "La descripción es obligatoria").max(200, "La descripción es muy larga"),
});

export type LibreOrdenInput = z.infer<typeof libreOrdenInputSchema>;

/** Edición en la celda de la tabla de la orden: llega un campo a la vez, nunca ninguno. */
export const cambiosConceptoOrdenSchema = z
  .object({
    cantidad: z
      .number()
      .int("La cantidad de un repuesto debe ser un número entero")
      .min(1, "La cantidad debe ser al menos 1")
      .max(9999, "La cantidad es demasiado grande")
      .optional(),
    precioUnitario: z.number().min(0, "El precio debe ser 0 o mayor").optional(),
    ivaPct: z.number().min(0, "El IVA no puede ser negativo").max(100, "El IVA no puede pasar de 100 %").optional(),
    descripcion: z.string().trim().min(1, "La descripción es obligatoria").max(200, "La descripción es muy larga").optional(),
    mecanicoId: z.string().min(1).nullable().optional(),
  })
  .refine((datos) => Object.values(datos).some((valor) => valor !== undefined), { message: "No hay cambios que guardar" });

export type CambiosConceptoOrden = z.infer<typeof cambiosConceptoOrdenSchema>;
