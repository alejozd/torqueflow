-- AlterTable
ALTER TABLE "items_orden" ADD COLUMN     "repuesto_id" TEXT;

-- CreateIndex
CREATE INDEX "items_orden_repuesto_id_idx" ON "items_orden"("repuesto_id");

-- AddForeignKey
ALTER TABLE "items_orden" ADD CONSTRAINT "items_orden_repuesto_id_fkey" FOREIGN KEY ("repuesto_id") REFERENCES "repuestos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
