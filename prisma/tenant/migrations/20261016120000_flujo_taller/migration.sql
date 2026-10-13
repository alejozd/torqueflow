-- CreateEnum
CREATE TYPE "PrioridadOrden" AS ENUM ('BAJA', 'NORMAL', 'ALTA', 'URGENTE');

-- AlterEnum
ALTER TYPE "TipoEventoAuditoria" ADD VALUE 'PRIORIDAD_CAMBIAR';

-- AlterTable
ALTER TABLE "ordenes_trabajo" ADD COLUMN     "prioridad" "PrioridadOrden" NOT NULL DEFAULT 'NORMAL';

-- AlterTable
ALTER TABLE "configuracion_taller" ADD COLUMN     "dias_orden_estancada" INTEGER NOT NULL DEFAULT 3;
