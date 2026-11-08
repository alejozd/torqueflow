-- IVA por línea en la cotización: lo existente queda en 19 %.
ALTER TABLE "items_cotizacion" ADD COLUMN "iva_pct" DECIMAL(5,2) NOT NULL DEFAULT 19;
