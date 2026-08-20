-- CreateEnum
CREATE TYPE "DviFotoMomento" AS ENUM ('ANTES', 'DESPUES');

-- CreateTable
CREATE TABLE "dvi" (
    "id" TEXT NOT NULL,
    "orden_id" TEXT NOT NULL,
    "checklist" JSONB NOT NULL DEFAULT '{}',
    "creado_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dvi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dvi_fotos" (
    "id" TEXT NOT NULL,
    "dvi_id" TEXT NOT NULL,
    "momento" "DviFotoMomento" NOT NULL,
    "url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dvi_fotos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dvi_orden_id_key" ON "dvi"("orden_id");

-- CreateIndex
CREATE INDEX "dvi_fotos_dvi_id_idx" ON "dvi_fotos"("dvi_id");

-- AddForeignKey
ALTER TABLE "dvi" ADD CONSTRAINT "dvi_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "ordenes_trabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dvi" ADD CONSTRAINT "dvi_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dvi_fotos" ADD CONSTRAINT "dvi_fotos_dvi_id_fkey" FOREIGN KEY ("dvi_id") REFERENCES "dvi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
