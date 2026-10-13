-- CreateEnum
CREATE TYPE "FrecuenciaLiquidacion" AS ENUM ('SEMANAL', 'QUINCENAL', 'MENSUAL');

-- CreateEnum
CREATE TYPE "TipoEsquemaLiquidacion" AS ENUM ('PORCENTAJE', 'FIJO', 'MIXTO');

-- CreateEnum
CREATE TYPE "EstadoLiquidacion" AS ENUM ('PENDIENTE', 'PAGADA', 'ANULADA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoEventoAuditoria" ADD VALUE 'LIQUIDACION_GENERAR';
ALTER TYPE "TipoEventoAuditoria" ADD VALUE 'LIQUIDACION_AJUSTAR';
ALTER TYPE "TipoEventoAuditoria" ADD VALUE 'LIQUIDACION_PAGAR';
ALTER TYPE "TipoEventoAuditoria" ADD VALUE 'LIQUIDACION_ANULAR';
ALTER TYPE "TipoEventoAuditoria" ADD VALUE 'LIQUIDACION_ESQUEMA_ACTUALIZAR';
ALTER TYPE "TipoEventoAuditoria" ADD VALUE 'LIQUIDACION_FRECUENCIA_ACTUALIZAR';

-- AlterTable
ALTER TABLE "configuracion_taller" ADD COLUMN     "frecuencia_liquidacion" "FrecuenciaLiquidacion" NOT NULL DEFAULT 'MENSUAL';

-- CreateTable
CREATE TABLE "esquemas_liquidacion" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "tipo" "TipoEsquemaLiquidacion" NOT NULL,
    "porcentaje" DECIMAL(5,2),
    "monto_fijo" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "esquemas_liquidacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidaciones_mecanico" (
    "id" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "frecuencia" "FrecuenciaLiquidacion" NOT NULL,
    "sede_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "estado" "EstadoLiquidacion" NOT NULL DEFAULT 'PENDIENTE',
    "ordenes" INTEGER NOT NULL,
    "trabajos" INTEGER NOT NULL,
    "monto_mano_obra" DECIMAL(10,2) NOT NULL,
    "tipo" "TipoEsquemaLiquidacion" NOT NULL,
    "porcentaje" DECIMAL(5,2),
    "monto_fijo" DECIMAL(10,2),
    "monto_calculado" DECIMAL(10,2) NOT NULL,
    "ajuste" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "motivo_ajuste" TEXT,
    "total" DECIMAL(10,2) NOT NULL,
    "generada_por_id" TEXT NOT NULL,
    "generada_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pagada_at" TIMESTAMP(3),
    "pagada_por_id" TEXT,
    "gasto_id" TEXT,
    "anulada_at" TIMESTAMP(3),
    "anulada_por_id" TEXT,
    "motivo_anulacion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "liquidaciones_mecanico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "esquemas_liquidacion_usuario_id_key" ON "esquemas_liquidacion"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "liquidaciones_mecanico_gasto_id_key" ON "liquidaciones_mecanico"("gasto_id");

-- CreateIndex
CREATE INDEX "liquidaciones_mecanico_sede_id_periodo_idx" ON "liquidaciones_mecanico"("sede_id", "periodo");

-- CreateIndex
CREATE INDEX "liquidaciones_mecanico_usuario_id_idx" ON "liquidaciones_mecanico"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "liquidaciones_mecanico_periodo_usuario_id_sede_id_key" ON "liquidaciones_mecanico"("periodo", "usuario_id", "sede_id");

-- AddForeignKey
ALTER TABLE "esquemas_liquidacion" ADD CONSTRAINT "esquemas_liquidacion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones_mecanico" ADD CONSTRAINT "liquidaciones_mecanico_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones_mecanico" ADD CONSTRAINT "liquidaciones_mecanico_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones_mecanico" ADD CONSTRAINT "liquidaciones_mecanico_generada_por_id_fkey" FOREIGN KEY ("generada_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones_mecanico" ADD CONSTRAINT "liquidaciones_mecanico_pagada_por_id_fkey" FOREIGN KEY ("pagada_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones_mecanico" ADD CONSTRAINT "liquidaciones_mecanico_gasto_id_fkey" FOREIGN KEY ("gasto_id") REFERENCES "gastos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones_mecanico" ADD CONSTRAINT "liquidaciones_mecanico_anulada_por_id_fkey" FOREIGN KEY ("anulada_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed: categoría de gasto del sistema para pagar liquidaciones de mecánicos.
-- El aprovisionamiento de tenants corre migrate deploy, así que esto cubre
-- talleres existentes y nuevos (misma idea que la siembra de la Fase 16).
-- ON CONFLICT: la tabla es editable desde la Fase 16, así que el taller pudo
-- crear ya una categoría con ese nombre (nombre es único); sin esto, migrate
-- deploy fallaría entero.
INSERT INTO "categorias_gasto" ("id", "nombre", "orden") VALUES ('cat_liquidacion_mecanicos', 'Liquidación de mecánicos', 11)
ON CONFLICT ("nombre") DO NOTHING;
