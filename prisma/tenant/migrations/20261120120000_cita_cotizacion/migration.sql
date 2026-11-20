-- Una cita puede venir de una cotización aceptada (botón "Agendar cita").
-- Columna opcional: las citas existentes quedan sin cotización.
ALTER TABLE "citas" ADD COLUMN "cotizacion_id" TEXT;

CREATE INDEX "citas_cotizacion_id_idx" ON "citas"("cotizacion_id");

ALTER TABLE "citas" ADD CONSTRAINT "citas_cotizacion_id_fkey" FOREIGN KEY ("cotizacion_id") REFERENCES "cotizaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
