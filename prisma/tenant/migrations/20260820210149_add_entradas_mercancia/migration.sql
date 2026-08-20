-- CreateTable
CREATE TABLE "entradas_mercancia" (
    "id" TEXT NOT NULL,
    "proveedor_id" TEXT NOT NULL,
    "bodega_id" TEXT NOT NULL,
    "creado_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entradas_mercancia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entrada_mercancia_items" (
    "id" TEXT NOT NULL,
    "entrada_id" TEXT NOT NULL,
    "repuesto_id" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_compra_unitario" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entrada_mercancia_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "entradas_mercancia_proveedor_id_idx" ON "entradas_mercancia"("proveedor_id");

-- CreateIndex
CREATE INDEX "entradas_mercancia_bodega_id_idx" ON "entradas_mercancia"("bodega_id");

-- CreateIndex
CREATE INDEX "entrada_mercancia_items_entrada_id_idx" ON "entrada_mercancia_items"("entrada_id");

-- CreateIndex
CREATE INDEX "entrada_mercancia_items_repuesto_id_idx" ON "entrada_mercancia_items"("repuesto_id");

-- AddForeignKey
ALTER TABLE "entradas_mercancia" ADD CONSTRAINT "entradas_mercancia_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entradas_mercancia" ADD CONSTRAINT "entradas_mercancia_bodega_id_fkey" FOREIGN KEY ("bodega_id") REFERENCES "bodegas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entradas_mercancia" ADD CONSTRAINT "entradas_mercancia_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entrada_mercancia_items" ADD CONSTRAINT "entrada_mercancia_items_entrada_id_fkey" FOREIGN KEY ("entrada_id") REFERENCES "entradas_mercancia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entrada_mercancia_items" ADD CONSTRAINT "entrada_mercancia_items_repuesto_id_fkey" FOREIGN KEY ("repuesto_id") REFERENCES "repuestos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
