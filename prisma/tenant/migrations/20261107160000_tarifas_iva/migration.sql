-- CreateTable
CREATE TABLE "tarifas_iva" (
    "id" TEXT NOT NULL,
    "porcentaje" DECIMAL(5,2) NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "predeterminada" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tarifas_iva_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tarifas_iva_porcentaje_key" ON "tarifas_iva"("porcentaje");

-- Tarifas de Colombia con las que arranca cada taller; 19 % es la predeterminada.
INSERT INTO "tarifas_iva" ("id", "porcentaje", "nombre", "activa", "predeterminada", "updated_at") VALUES
    ('tarifa_iva_0', 0, 'Exento', true, false, CURRENT_TIMESTAMP),
    ('tarifa_iva_5', 5, 'Reducida', true, false, CURRENT_TIMESTAMP),
    ('tarifa_iva_19', 19, 'General', true, true, CURRENT_TIMESTAMP);
