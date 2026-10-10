-- CreateEnum
CREATE TYPE "TipoVehiculo" AS ENUM ('CARRO', 'MOTO', 'CAMIONETA', 'CAMION');

-- CreateEnum
CREATE TYPE "TipoDocumentoVehiculo" AS ENUM ('SOAT', 'TECNOMECANICA');

-- CreateEnum
CREATE TYPE "CanalAviso" AS ENUM ('EMAIL', 'WHATSAPP');

-- AlterTable
ALTER TABLE "vehiculos" ADD COLUMN     "tipo" "TipoVehiculo" NOT NULL DEFAULT 'CARRO',
ADD COLUMN     "vin" TEXT,
ADD COLUMN     "soat_vence" DATE,
ADD COLUMN     "tecnomecanica_vence" DATE;

-- CreateTable
CREATE TABLE "avisos_vencimiento" (
    "id" TEXT NOT NULL,
    "vehiculo_id" TEXT NOT NULL,
    "tipo" "TipoDocumentoVehiculo" NOT NULL,
    "fecha_vencimiento" DATE NOT NULL,
    "canal" "CanalAviso" NOT NULL,
    "destino" TEXT NOT NULL,
    "enviado_por_id" TEXT,
    "enviado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avisos_vencimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracion_taller" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "dias_aviso_vencimiento" INTEGER NOT NULL DEFAULT 30,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_taller_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "avisos_vencimiento_enviado_por_id_idx" ON "avisos_vencimiento"("enviado_por_id");

-- CreateIndex
CREATE UNIQUE INDEX "avisos_vencimiento_vehiculo_id_tipo_fecha_vencimiento_canal_key" ON "avisos_vencimiento"("vehiculo_id", "tipo", "fecha_vencimiento", "canal");

-- AddForeignKey
ALTER TABLE "avisos_vencimiento" ADD CONSTRAINT "avisos_vencimiento_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avisos_vencimiento" ADD CONSTRAINT "avisos_vencimiento_enviado_por_id_fkey" FOREIGN KEY ("enviado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
