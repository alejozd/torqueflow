-- IVA por línea en las ventas de mostrador: lo existente queda en 19 %.
ALTER TABLE "venta_mostrador_items" ADD COLUMN "iva_pct" DECIMAL(5,2) NOT NULL DEFAULT 19;

-- Desglose del IVA por tarifa guardado en la venta, como en la factura.
ALTER TABLE "ventas_mostrador" ADD COLUMN "desglose_iva" JSONB NOT NULL DEFAULT '[]';

-- Las ventas anteriores se cobraron todas al 19 %: un solo tramo sobre (subtotal - descuento).
UPDATE "ventas_mostrador"
SET "desglose_iva" = jsonb_build_array(
  jsonb_build_object('ivaPct', 19, 'base', "subtotal" - "descuento", 'iva', "iva")
)
WHERE "subtotal" - "descuento" > 0;
