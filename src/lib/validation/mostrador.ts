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

/** Dinero con centavos a lo sumo: evita montos como 10.005 que se redondean distinto. */
export const dosDecimales = (valor: number) => Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-6;

export const pagoVentaSchema = z.object({
  metodoPago: metodoPagoVentaSchema,
  monto: z.coerce
    .number({ error: "El monto no es válido" })
    .refine((valor) => valor > 0, "Cada pago debe ser mayor que cero")
    .refine(dosDecimales, "El monto no puede tener más de 2 decimales")
    .refine((valor) => valor <= MONTO_MAXIMO_VENTA, "El monto es demasiado alto"),
  referencia: z.preprocess(vacioComoUndefined, z.string().trim().max(120).nullish()),
});

export const ventaMostradorInputSchema = z
  .object({
    clienteId: z.preprocess(vacioComoUndefined, z.string().trim().min(1).optional()),
    lineas: z.array(lineaVentaSchema).min(1, "Agrega al menos un producto"),
    descuento: z.preprocess(
      (v) => (v === "" || v === null || v === undefined ? 0 : v),
      z.coerce.number({ error: "El descuento no es válido" }).min(0, "El descuento no puede ser negativo"),
    ),
    /** Pagos mixtos; vacío = todo a crédito (solo con cliente, lo valida la acción). */
    pagos: z.array(pagoVentaSchema).max(10, "Demasiados pagos").default([]),
    /** Efectivo que entregó el cliente, para calcular las vueltas. */
    /** Total que el cajero vio en pantalla: si los precios cambiaron, el servidor lo rechaza. */
    totalEsperado: z.coerce
      .number({ error: "Falta el total de la venta" })
      .min(0, "El total no es válido")
      .refine(dosDecimales, "El total no puede tener más de 2 decimales"),
    recibidoEfectivo: z.preprocess(vacioComoUndefined, z.coerce.number().min(0).max(MONTO_MAXIMO_VENTA).refine(dosDecimales, "Lo recibido no puede tener más de 2 decimales").optional()),
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
    .refine(dosDecimales, "El monto no puede tener más de 2 decimales")
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
