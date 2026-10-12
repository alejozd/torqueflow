-- CreateTable
CREATE TABLE "servicios" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "precio_mano_obra" DECIMAL(10,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "servicios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servicio_repuestos" (
    "id" TEXT NOT NULL,
    "servicio_id" TEXT NOT NULL,
    "repuesto_id" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,

    CONSTRAINT "servicio_repuestos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "servicios_nombre_key" ON "servicios"("nombre");

-- CreateIndex
CREATE INDEX "servicio_repuestos_repuesto_id_idx" ON "servicio_repuestos"("repuesto_id");

-- CreateIndex
CREATE UNIQUE INDEX "servicio_repuestos_servicio_id_repuesto_id_key" ON "servicio_repuestos"("servicio_id", "repuesto_id");

-- AddForeignKey
ALTER TABLE "servicio_repuestos" ADD CONSTRAINT "servicio_repuestos_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicio_repuestos" ADD CONSTRAINT "servicio_repuestos_repuesto_id_fkey" FOREIGN KEY ("repuesto_id") REFERENCES "repuestos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
