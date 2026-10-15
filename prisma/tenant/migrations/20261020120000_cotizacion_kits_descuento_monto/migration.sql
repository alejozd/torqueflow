-- CreateEnum
CREATE TYPE "TipoDescuento" AS ENUM ('PORCENTAJE', 'MONTO');

-- AlterTable
ALTER TABLE "items_orden" ADD COLUMN     "grupo_kit_id" TEXT,
ADD COLUMN     "grupo_kit_nombre" TEXT,
ADD COLUMN     "servicio_id" TEXT;

-- AlterTable
ALTER TABLE "mano_de_obra" ADD COLUMN     "grupo_kit_id" TEXT,
ADD COLUMN     "grupo_kit_nombre" TEXT,
ADD COLUMN     "servicio_id" TEXT;

-- AlterTable
ALTER TABLE "cotizaciones" ADD COLUMN     "descuento_monto" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "descuento_tipo" "TipoDescuento" NOT NULL DEFAULT 'PORCENTAJE';

-- AlterTable
ALTER TABLE "items_cotizacion" ADD COLUMN     "grupo_kit_id" TEXT,
ADD COLUMN     "grupo_kit_nombre" TEXT,
ADD COLUMN     "servicio_id" TEXT;

-- CreateIndex
CREATE INDEX "items_orden_servicio_id_idx" ON "items_orden"("servicio_id");

-- CreateIndex
CREATE INDEX "mano_de_obra_servicio_id_idx" ON "mano_de_obra"("servicio_id");

-- CreateIndex
CREATE INDEX "items_cotizacion_servicio_id_idx" ON "items_cotizacion"("servicio_id");

-- AddForeignKey
ALTER TABLE "items_orden" ADD CONSTRAINT "items_orden_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mano_de_obra" ADD CONSTRAINT "mano_de_obra_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_cotizacion" ADD CONSTRAINT "items_cotizacion_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

