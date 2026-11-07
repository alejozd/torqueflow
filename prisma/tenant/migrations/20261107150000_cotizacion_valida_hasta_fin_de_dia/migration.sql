-- Corrige "Válida hasta" de cotizaciones creadas desde el calendario: se
-- guardaban a medianoche UTC del día elegido (en Bogotá, las 7 p. m. del día
-- anterior). Pasan al final de ese día en Bogotá (23:59:59.999 -05:00 =
-- 04:59:59.999 UTC del día siguiente), igual que guarda ahora el formulario.
-- Solo toca valores exactamente a medianoche UTC; los que vienen de "Enviar"
-- (ahora + N días) tienen hora y no cambian. Es idempotente: tras correr, ya
-- ninguno queda a medianoche.
UPDATE "cotizaciones"
SET "valida_hasta" = "valida_hasta" + INTERVAL '1 day 4 hours 59 minutes 59.999 seconds'
WHERE "valida_hasta" IS NOT NULL
  AND "valida_hasta" = date_trunc('day', "valida_hasta");
