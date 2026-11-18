-- Tanda 3: los precios pasan a ser con IVA incluido. Se suben con su IVA el
-- catálogo y las líneas de los documentos abiertos; lo cerrado (facturas,
-- ventas del Mostrador, cotizaciones aprobadas/rechazadas/vencidas y órdenes
-- facturadas o anuladas) no se toca: guarda sus propios totales.
-- Solo cambia datos: el esquema queda igual.

UPDATE "repuestos"
SET "precio_venta" = ROUND("precio_venta" * (1 + "iva_pct" / 100));

UPDATE "servicios"
SET "precio_mano_obra" = ROUND("precio_mano_obra" * (1 + "iva_pct" / 100));

UPDATE "items_cotizacion" ic
SET "precio_unitario" = ROUND(ic."precio_unitario" * (1 + ic."iva_pct" / 100))
FROM "cotizaciones" c
WHERE c."id" = ic."cotizacion_id"
  AND c."estado" IN ('BORRADOR', 'ENVIADA');

UPDATE "items_orden" io
SET "precio_unitario" = ROUND(io."precio_unitario" * (1 + io."iva_pct" / 100))
FROM "ordenes_trabajo" o
WHERE o."id" = io."orden_id"
  AND o."estado" <> 'ANULADA'
  AND NOT EXISTS (SELECT 1 FROM "facturas" f WHERE f."orden_id" = o."id");

UPDATE "mano_de_obra" mo
SET "valor" = ROUND(mo."valor" * (1 + mo."iva_pct" / 100))
FROM "ordenes_trabajo" o
WHERE o."id" = mo."orden_id"
  AND o."estado" <> 'ANULADA'
  AND NOT EXISTS (SELECT 1 FROM "facturas" f WHERE f."orden_id" = o."id");
