-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN "permisos_agregados" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "permisos_quitados" TEXT[] DEFAULT ARRAY[]::TEXT[];
