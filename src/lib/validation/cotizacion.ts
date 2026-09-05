import { z } from "zod";
import { requiredMoney } from "./money";

// clienteId is deliberately not part of this schema: same rule
// createOrdenDesdeVehiculoAction documents (src/app/actions/orden-actions.ts) --
// it is derived server-side from the vehículo so "create a cotización for
// vehicle X under client Y" can't be forged from form data.
export const crearCotizacionInputSchema = z.object({
  vehiculoId: z.string().min(1, "Selecciona un vehículo"),
  motivo: z.string().min(1, "El motivo es obligatorio").max(500, "El motivo es demasiado largo"),
  validaHasta: z.coerce.date().optional(),
});

export type CrearCotizacionInput = z.infer<typeof crearCotizacionInputSchema>;

export const itemCotizacionInputSchema = z
  .object({
    tipo: z.enum(["REPUESTO", "MANO_OBRA"], { error: "Selecciona el tipo de ítem" }),
    repuestoId: z.string().optional().or(z.literal("")),
    descripcion: z.string().optional().or(z.literal("")),
    // "" and null must not silently coerce to 0 (z.coerce.number() treats
    // both as valid input -> 0) -- same pitfall itemOrdenInputSchema exists
    // to avoid, applied here so the schema itself guarantees this instead of
    // relying on every caller to pre-sanitize independently.
    cantidad: z.preprocess(
      (v) => (v === "" || v === null || v === undefined ? undefined : v),
      z.coerce.number({ error: "La cantidad es obligatoria" }).positive("La cantidad debe ser mayor a 0"),
    ),
    precioUnitario: requiredMoney("El precio unitario es obligatorio"),
  })
  .refine((data) => data.tipo !== "REPUESTO" || Boolean(data.repuestoId), {
    message: "Selecciona un repuesto del inventario",
    path: ["repuestoId"],
  })
  .refine((data) => data.tipo !== "MANO_OBRA" || Boolean(data.descripcion), {
    message: "Describe el concepto de mano de obra",
    path: ["descripcion"],
  });

export type ItemCotizacionInput = z.infer<typeof itemCotizacionInputSchema>;

export const descuentoCotizacionInputSchema = z.object({
  descuentoPct: z.coerce
    .number({ error: "El descuento es obligatorio" })
    .min(0, "El descuento no puede ser negativo")
    .max(100, "El descuento no puede superar 100%"),
});

export type DescuentoCotizacionInput = z.infer<typeof descuentoCotizacionInputSchema>;

export const enviarCotizacionInputSchema = z.object({
  canal: z.enum(["EMAIL", "WHATSAPP", "OTRO"], { error: "Selecciona un canal de envío" }),
  vigenciaDias: z.coerce.number().int().positive("La vigencia debe ser al menos 1 día"),
  notas: z.string().optional().or(z.literal("")),
});

export type EnviarCotizacionInput = z.infer<typeof enviarCotizacionInputSchema>;

export const estadoCotizacionSchema = z.enum(["BORRADOR", "ENVIADA", "APROBADA", "RECHAZADA", "VENCIDA"]);
