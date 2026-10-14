-- AlterTable
ALTER TABLE "configuracion_taller" ADD COLUMN     "exigir_acta_firmada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "usar_control_caja" BOOLEAN NOT NULL DEFAULT false;
