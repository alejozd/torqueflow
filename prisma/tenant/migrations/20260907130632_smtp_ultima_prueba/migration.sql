-- AlterTable
ALTER TABLE "configuracion_smtp" ADD COLUMN     "ultima_prueba_at" TIMESTAMP(3),
ADD COLUMN     "ultima_prueba_destino" TEXT,
ADD COLUMN     "ultima_prueba_exitosa" BOOLEAN;
