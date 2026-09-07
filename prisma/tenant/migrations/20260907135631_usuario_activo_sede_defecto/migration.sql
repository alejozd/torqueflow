-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sede_defecto_id" TEXT;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_sede_defecto_id_fkey" FOREIGN KEY ("sede_defecto_id") REFERENCES "sedes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
