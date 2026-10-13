import { z } from "zod";
import { requiredMoney, vacioComoUndefined } from "@/lib/validation/money";

/**
 * Validación del mostrador (Fase 24). El descuento es un **monto**, igual que en
 * la factura, para que los dos documentos se calculen con la misma regla.
 */

/** Tope de dinero por línea y por venta, por coherencia con la facturación. */
export const MONTO_MAXIMO_VENTA = 99_999_999.99;

export const metodoPagoVentaSchema = z.enum(["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"], {
  error: "Elige cómo se cobró",
});

export const lineaVentaSchema = z.object({
  repuestoId: z.preprocess(vacioComoUndefined, z.string().trim().min(1).optional()),
  descripcion: z.string().trim().min(1, "Escribe qué se vende").max(200, "La descripción es muy larga"),
  cantidad: z.coerce
    .number({ error: "La cantidad debe ser al menos 1" })
    .int("La cantidad debe ser un número entero")
    .min(1, "La cantidad debe ser al menos 1")
    .max(9_999, "La cantidad es demasiado alta"),
  precioUnitario: requiredMoney("El precio es obligatorio").refine(
    (valor) => valor <= MONTO_MAXIMO_VENTA,
    "El precio es demasiado alto",
  ),
});

export const ventaMostradorInputSchema = z
  .object({
    clienteId: z.preprocess(vacioComoUndefined, z.string().trim().min(1).optional()),
    lineas: z.array(lineaVentaSchema).min(1, "Agrega al menos un producto"),
    descuento: z.preprocess(
      (v) => (v === "" || v === null || v === undefined ? 0 : v),
      z.coerce.number({ error: "El descuento no es válido" }).min(0, "El descuento no puede ser negativo"),
    ),
    metodoPago: metodoPagoVentaSchema,
    referencia: z.preprocess(vacioComoUndefined, z.string().trim().max(120).optional()),
    /** Con cliente, puede quedar a crédito; sin cliente, la venta tiene que salir pagada. */
    cobrarTodo: z.preprocess((v) => v === "true" || v === true, z.boolean()),
  })
  .refine(
    // Sin esto un descuento mayor que el subtotal daría un total negativo, que se
    // guardaría como pago negativo y el arqueo sumaría como ingreso (D8).
    (datos) => {
      const subtotal = datos.lineas.reduce((suma, linea) => suma + linea.cantidad * linea.precioUnitario, 0);
      return datos.descuento <= subtotal;
    },
    { error: "El descuento no puede ser mayor que el subtotal", path: ["descuento"] },
  );

/** Cobro de una venta que quedó a crédito. */
export const cobroVentaSchema = z.object({
  monto: requiredMoney("El monto es obligatorio")
    .refine((valor) => valor > 0, "El monto debe ser mayor que cero")
    .refine((valor) => valor <= MONTO_MAXIMO_VENTA, "El monto es demasiado alto"),
  metodoPago: metodoPagoVentaSchema,
  referencia: z.preprocess(vacioComoUndefined, z.string().trim().max(120).optional()),
});

export const devolucionMostradorInputSchema = z.object({  ventaId: z.string().trim().min(1, "Falta la venta"),
  lineas: z
    .array(
      z.object({
        ventaItemId: z.string().trim().min(1),
        cantidad: z.coerce
          .number({ error: "La cantidad debe ser al menos 1" })
          .int("La cantidad debe ser un número entero")
          .min(1, "La cantidad debe ser al menos 1"),
      }),
    )
    .min(1, "Elige al menos una línea para devolver"),
  motivo: z.preprocess(vacioComoUndefined, z.string().trim().max(300, "El motivo es muy largo").optional()),
  metodoPago: metodoPagoVentaSchema,
});

export type VentaMostradorInput = z.infer<typeof ventaMostradorInputSchema>;
export type DevolucionMostradorInput = z.infer<typeof devolucionMostradorInputSchema>;
export type LineaVentaInput = z.infer<typeof lineaVentaSchema>;
