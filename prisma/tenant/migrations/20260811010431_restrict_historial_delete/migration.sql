-- DropForeignKey
ALTER TABLE "historial_vehiculo" DROP CONSTRAINT "historial_vehiculo_vehiculo_id_fkey";

-- AddForeignKey
ALTER TABLE "historial_vehiculo" ADD CONSTRAINT "historial_vehiculo_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
