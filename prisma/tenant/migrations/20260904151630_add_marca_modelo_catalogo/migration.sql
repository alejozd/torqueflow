-- AlterTable
ALTER TABLE "vehiculos" ADD COLUMN     "marca_id" TEXT,
ADD COLUMN     "modelo_id" TEXT;

-- CreateTable
CREATE TABLE "marcas_vehiculo" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marcas_vehiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modelos_vehiculo" (
    "id" TEXT NOT NULL,
    "marca_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modelos_vehiculo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "marcas_vehiculo_nombre_key" ON "marcas_vehiculo"("nombre");

-- CreateIndex
CREATE INDEX "modelos_vehiculo_marca_id_idx" ON "modelos_vehiculo"("marca_id");

-- CreateIndex
CREATE UNIQUE INDEX "modelos_vehiculo_marca_id_nombre_key" ON "modelos_vehiculo"("marca_id", "nombre");

-- CreateIndex
CREATE INDEX "vehiculos_marca_id_idx" ON "vehiculos"("marca_id");

-- CreateIndex
CREATE INDEX "vehiculos_modelo_id_idx" ON "vehiculos"("modelo_id");

-- AddForeignKey
ALTER TABLE "modelos_vehiculo" ADD CONSTRAINT "modelos_vehiculo_marca_id_fkey" FOREIGN KEY ("marca_id") REFERENCES "marcas_vehiculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehiculos" ADD CONSTRAINT "vehiculos_marca_id_fkey" FOREIGN KEY ("marca_id") REFERENCES "marcas_vehiculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehiculos" ADD CONSTRAINT "vehiculos_modelo_id_fkey" FOREIGN KEY ("modelo_id") REFERENCES "modelos_vehiculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
