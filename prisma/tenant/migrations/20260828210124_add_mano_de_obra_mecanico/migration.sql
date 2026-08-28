-- AlterTable
ALTER TABLE "mano_de_obra" ADD COLUMN     "mecanico_id" TEXT;

-- CreateIndex
CREATE INDEX "mano_de_obra_mecanico_id_idx" ON "mano_de_obra"("mecanico_id");

-- AddForeignKey
ALTER TABLE "mano_de_obra" ADD CONSTRAINT "mano_de_obra_mecanico_id_fkey" FOREIGN KEY ("mecanico_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
