-- CreateEnum
CREATE TYPE "ResultadoNotificacionOrden" AS ENUM ('ENVIADA', 'FALLO_ENVIO');

-- CreateTable
CREATE TABLE "notificaciones_orden_enviadas" (
    "id" TEXT NOT NULL,
    "orden_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "estado" "EstadoOrden" NOT NULL,
    "email_destino" TEXT NOT NULL,
    "resultado" "ResultadoNotificacionOrden" NOT NULL,
    "enviado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_orden_enviadas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notificaciones_orden_enviadas_orden_id_enviado_at_idx" ON "notificaciones_orden_enviadas"("orden_id", "enviado_at");

-- CreateIndex
CREATE INDEX "notificaciones_orden_enviadas_cliente_id_idx" ON "notificaciones_orden_enviadas"("cliente_id");

-- AddForeignKey
ALTER TABLE "notificaciones_orden_enviadas" ADD CONSTRAINT "notificaciones_orden_enviadas_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "ordenes_trabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones_orden_enviadas" ADD CONSTRAINT "notificaciones_orden_enviadas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
