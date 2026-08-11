-- AddForeignKey
ALTER TABLE "historial_vehiculo" ADD CONSTRAINT "historial_vehiculo_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
