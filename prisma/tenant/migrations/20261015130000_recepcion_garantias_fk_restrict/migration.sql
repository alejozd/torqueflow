-- DropForeignKey
ALTER TABLE "actas_entrega" DROP CONSTRAINT "actas_entrega_orden_id_fkey";

-- DropForeignKey
ALTER TABLE "danios_orden" DROP CONSTRAINT "danios_orden_orden_id_fkey";

-- DropForeignKey
ALTER TABLE "garantias" DROP CONSTRAINT "garantias_orden_id_fkey";

-- AddForeignKey
ALTER TABLE "danios_orden" ADD CONSTRAINT "danios_orden_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "ordenes_trabajo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actas_entrega" ADD CONSTRAINT "actas_entrega_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "ordenes_trabajo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garantias" ADD CONSTRAINT "garantias_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "ordenes_trabajo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
