-- Desglose del IVA por tarifa guardado en la factura.
ALTER TABLE "facturas" ADD COLUMN "desglose_iva" JSONB NOT NULL DEFAULT '[]';

-- Las facturas anteriores se emitieron todas al 19 %: un solo tramo sobre (subtotal - descuento).
UPDATE "facturas"
SET "desglose_iva" = jsonb_build_array(
  jsonb_build_object('ivaPct', 19, 'base', "subtotal" - "descuento", 'iva', "iva")
)
WHERE "subtotal" - "descuento" > 0;
