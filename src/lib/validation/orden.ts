import { z } from "zod";

export const ordenTrabajoInputSchema = z.object({
  mecanicoId: z.string().optional().or(z.literal("")),
  kilometrajeIngreso: z.coerce.number().int().min(0, "El kilometraje no puede ser negativo").optional(),
  sintomas: z.string().optional().or(z.literal("")),
});

export type OrdenTrabajoInput = z.infer<typeof ordenTrabajoInputSchema>;

export const itemOrdenInputSchema = z
  .object({
    repuestoId: z.string().optional().or(z.literal("")),
    descripcion: z.string().optional().or(z.literal("")),
    cantidad: z.coerce.number().int().min(1, "La cantidad debe ser al menos 1"),
    precioUnitario: z.coerce.number().min(0, "El precio no puede ser negativo").optional(),
  })
  .refine((data) => Boolean(data.repuestoId) || (Boolean(data.descripcion) && data.precioUnitario !== undefined), {
    message: "Selecciona un repuesto del inventario o completa descripción y precio manualmente",
  });

export type ItemOrdenInput = z.infer<typeof itemOrdenInputSchema>;

export const manoDeObraInputSchema = z.object({
  descripcion: z.string().min(1, "La descripción es obligatoria"),
  // "" must not silently coerce to 0 (Number("") === 0) -- same pitfall
  // requiredMoney in money.ts exists to avoid, applied inline here to keep
  // the distinct "obligatorio" vs "no puede ser negativo" messages.
  valor: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number({ error: "El valor es obligatorio" }).min(0, "El valor no puede ser negativo"),
  ),
  // Opcional, igual que OrdenTrabajo.mecanicoId: una tarea puede quedar sin
  // asignar y completarse después.
  mecanicoId: z.string().optional().or(z.literal("")),
});

export type ManoDeObraInput = z.infer<typeof manoDeObraInputSchema>;

export const estadoOrdenSchema = z.enum(["BORRADOR", "EN_PROCESO", "TERMINADA", "ENTREGADA", "ANULADA"]);
