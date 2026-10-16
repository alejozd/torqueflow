-- AlterTable
ALTER TABLE "ventas_mostrador" ADD COLUMN     "recibido_efectivo" DECIMAL(10,2),
ADD COLUMN     "vueltas" DECIMAL(10,2) NOT NULL DEFAULT 0;
