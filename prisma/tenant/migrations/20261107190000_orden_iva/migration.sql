-- IVA por línea en la orden: lo existente queda en 19 %.
ALTER TABLE "items_orden" ADD COLUMN "iva_pct" DECIMAL(5,2) NOT NULL DEFAULT 19;
ALTER TABLE "mano_de_obra" ADD COLUMN "iva_pct" DECIMAL(5,2) NOT NULL DEFAULT 19;
