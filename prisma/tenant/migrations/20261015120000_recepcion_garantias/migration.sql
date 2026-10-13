-- CreateEnum
CREATE TYPE "NivelCombustible" AS ENUM ('VACIO', 'CUARTO', 'MEDIO', 'TRES_CUARTOS', 'LLENO');

-- CreateEnum
CREATE TYPE "ZonaVehiculo" AS ENUM ('FRENTE', 'CAPO', 'PARABRISAS', 'TECHO', 'LATERAL_DERECHO', 'LATERAL_IZQUIERDO', 'PUERTA_DERECHA', 'PUERTA_IZQUIERDA', 'GUARDABARROS_DERECHO', 'GUARDABARROS_IZQUIERDO', 'COMPUERTA', 'RINES', 'ESPEJO_DERECHO', 'ESPEJO_IZQUIERDO', 'MANUBRIO', 'TANQUE', 'ASIENTO', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoDanio" AS ENUM ('GOLPE', 'RAYON', 'ROTURA', 'FALTANTE', 'OXIDO');

-- CreateEnum
CREATE TYPE "TipoGarantia" AS ENUM ('TRABAJO', 'REPUESTO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoEventoAuditoria" ADD VALUE 'ACTA_FIRMAR';
ALTER TYPE "TipoEventoAuditoria" ADD VALUE 'GARANTIA_REGISTRAR';
ALTER TYPE "TipoEventoAuditoria" ADD VALUE 'GARANTIA_ELIMINAR';

-- AlterTable
ALTER TABLE "ordenes_trabajo" ADD COLUMN     "nivel_combustible" "NivelCombustible";

-- CreateTable
CREATE TABLE "danios_orden" (
    "id" TEXT NOT NULL,
    "orden_id" TEXT NOT NULL,
    "zona" "ZonaVehiculo" NOT NULL,
    "tipo" "TipoDanio" NOT NULL,
    "nota" TEXT,
    "creado_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "danios_orden_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actas_entrega" (
    "id" TEXT NOT NULL,
    "orden_id" TEXT NOT NULL,
    "recibido_por" TEXT NOT NULL,
    "documento_recibe" TEXT,
    "firma_url" TEXT,
    "firma_foto_url" TEXT,
    "observaciones" TEXT,
    "firmada_at" TIMESTAMP(3),
    "creado_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "actas_entrega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garantias" (
    "id" TEXT NOT NULL,
    "orden_id" TEXT NOT NULL,
    "tipo" "TipoGarantia" NOT NULL,
    "mano_de_obra_id" TEXT,
    "item_orden_id" TEXT,
    "descripcion" TEXT NOT NULL,
    "cubre_hasta" DATE,
    "cubre_hasta_km" INTEGER,
    "nota" TEXT,
    "creado_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "garantias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "danios_orden_orden_id_idx" ON "danios_orden"("orden_id");

-- CreateIndex
CREATE INDEX "danios_orden_creado_por_id_idx" ON "danios_orden"("creado_por_id");

-- CreateIndex
CREATE UNIQUE INDEX "danios_orden_orden_id_zona_tipo_key" ON "danios_orden"("orden_id", "zona", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "actas_entrega_orden_id_key" ON "actas_entrega"("orden_id");

-- CreateIndex
CREATE INDEX "actas_entrega_creado_por_id_idx" ON "actas_entrega"("creado_por_id");

-- CreateIndex
CREATE INDEX "garantias_orden_id_idx" ON "garantias"("orden_id");

-- CreateIndex
CREATE INDEX "garantias_mano_de_obra_id_idx" ON "garantias"("mano_de_obra_id");

-- CreateIndex
CREATE INDEX "garantias_item_orden_id_idx" ON "garantias"("item_orden_id");

-- CreateIndex
CREATE INDEX "garantias_creado_por_id_idx" ON "garantias"("creado_por_id");

-- AddForeignKey
ALTER TABLE "danios_orden" ADD CONSTRAINT "danios_orden_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "ordenes_trabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "danios_orden" ADD CONSTRAINT "danios_orden_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actas_entrega" ADD CONSTRAINT "actas_entrega_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "ordenes_trabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actas_entrega" ADD CONSTRAINT "actas_entrega_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garantias" ADD CONSTRAINT "garantias_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "ordenes_trabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garantias" ADD CONSTRAINT "garantias_mano_de_obra_id_fkey" FOREIGN KEY ("mano_de_obra_id") REFERENCES "mano_de_obra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garantias" ADD CONSTRAINT "garantias_item_orden_id_fkey" FOREIGN KEY ("item_orden_id") REFERENCES "items_orden"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garantias" ADD CONSTRAINT "garantias_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
