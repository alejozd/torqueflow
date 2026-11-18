import { z } from "zod";
import { requiredMoney } from "./money";

export const facturarOrdenInputSchema = z.object({
  descuento: z.coerce.number().min(0, "El descuento no puede ser negativo").optional(),
});

export type FacturarOrdenInput = z.infer<typeof facturarOrdenInputSchema>;

/** Tarifa de IVA elegida para cada línea al revisar la factura ("item:…" o "mo:…"). */
export const tarifasFacturaSchema = z.array(
  z.object({
    conceptoId: z.string().min(1),
    ivaPct: z.number().min(0, "El IVA no puede ser negativo").max(100, "El IVA no puede pasar de 100 %"),
  }),
);

export type TarifasFactura = z.infer<typeof tarifasFacturaSchema>;

export const pagoInputSchema = z.object({
  monto: requiredMoney("El monto es obligatorio").refine((v) => v > 0, {
    message: "El monto debe ser mayor a 0",
  }),
  metodoPago: z.enum(["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"], {
    error: "Selecciona un método de pago",
  }),
  referencia: z.string().optional().or(z.literal("")),
});

export type PagoInput = z.infer<typeof pagoInputSchema>;
