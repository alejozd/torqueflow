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

// Sin descuentoTipo se asume PORCENTAJE (el formulario anterior solo enviaba
// descuentoPct). El monto en $ no tiene tope aquí: el cálculo de totales lo
// limita al subtotal, que puede cambiar después al editar los ítems.
export const descuentoCotizacionInputSchema = z.discriminatedUnion("descuentoTipo", [
  z.object({
    descuentoTipo: z.literal("PORCENTAJE"),
    descuentoPct: z.coerce
      .number({ error: "El descuento es obligatorio" })
      .min(0, "El descuento no puede ser negativo")
      .max(100, "El descuento no puede superar 100%"),
  }),
  z.object({
    descuentoTipo: z.literal("MONTO"),
    descuentoMonto: requiredMoney("El descuento debe ser un monto válido, 0 o mayor"),
  }),
]);

const descripcionItem = z
  .string()
  .trim()
  .min(1, "La descripción es obligatoria")
  .max(200, "La descripción es demasiado larga");

/** Ítem libre que se agrega desde el buscador: repuesto fuera del inventario o mano de obra. */
export const itemLibreCotizacionInputSchema = z.object({
  tipo: z.enum(["REPUESTO", "MANO_OBRA"], { error: "Selecciona el tipo de ítem" }),
  descripcion: descripcionItem,
});

export type ItemLibreCotizacionInput = z.infer<typeof itemLibreCotizacionInputSchema>;

/** Edición en la celda: llega un solo campo a la vez, nunca ninguno. */
export const actualizarItemCotizacionInputSchema = z
  .object({
    cantidad: z.coerce
      .number({ error: "La cantidad debe ser un número" })
      .positive("La cantidad debe ser mayor a 0")
      .max(9999, "La cantidad es demasiado grande")
      .optional(),
    precioUnitario: requiredMoney("El precio debe ser 0 o mayor").optional(),
    descripcion: descripcionItem.optional(),
    tipo: z.enum(["REPUESTO", "MANO_OBRA"]).optional(),
  })
  .refine((data) => Object.values(data).some((valor) => valor !== undefined), { message: "No hay cambios que guardar" });

export type ActualizarItemCotizacionInput = z.infer<typeof actualizarItemCotizacionInputSchema>;

export type DescuentoCotizacionInput = z.infer<typeof descuentoCotizacionInputSchema>;

export const enviarCotizacionInputSchema = z.object({
  canal: z.enum(["EMAIL", "WHATSAPP", "OTRO"], { error: "Selecciona un canal de envío" }),
  vigenciaDias: z.coerce.number().int().positive("La vigencia debe ser al menos 1 día"),
  notas: z.string().optional().or(z.literal("")),
});

export type EnviarCotizacionInput = z.infer<typeof enviarCotizacionInputSchema>;

export const estadoCotizacionSchema = z.enum(["BORRADOR", "ENVIADA", "APROBADA", "RECHAZADA", "VENCIDA"]);
