-- CreateEnum
CREATE TYPE "TipoSeguimiento" AS ENUM ('LLAMADA', 'WHATSAPP', 'EMAIL', 'VISITA', 'NOTA');

-- CreateTable
CREATE TABLE "cotizacion_seguimientos" (
    "id" TEXT NOT NULL,
    "cotizacion_id" TEXT NOT NULL,
    "tipo" "TipoSeguimiento" NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "resultado" TEXT NOT NULL,
    "proximo_seguimiento" TIMESTAMP(3),
    "creado_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cotizacion_seguimientos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cotizacion_seguimientos_cotizacion_id_idx" ON "cotizacion_seguimientos"("cotizacion_id");

-- AddForeignKey
ALTER TABLE "cotizacion_seguimientos" ADD CONSTRAINT "cotizacion_seguimientos_cotizacion_id_fkey" FOREIGN KEY ("cotizacion_id") REFERENCES "cotizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_seguimientos" ADD CONSTRAINT "cotizacion_seguimientos_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
