-- CreateEnum
CREATE TYPE "EstadoPedidoCompra" AS ENUM ('BORRADOR', 'ENVIADO', 'RECIBIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "CanalPedidoCompra" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateTable
CREATE TABLE "pedidos_compra" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "estado" "EstadoPedidoCompra" NOT NULL DEFAULT 'BORRADOR',
    "proveedor_id" TEXT NOT NULL,
    "bodega_id" TEXT NOT NULL,
    "creado_por_id" TEXT NOT NULL,
    "canal" "CanalPedidoCompra",
    "enviado_at" TIMESTAMP(3),
    "fecha_esperada" TIMESTAMP(3),
    "recibido_at" TIMESTAMP(3),
    "entrada_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedidos_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido_compra_items" (
    "id" TEXT NOT NULL,
    "pedido_id" TEXT NOT NULL,
    "repuesto_id" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_compra_unitario" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "pedido_compra_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_compra_numero_key" ON "pedidos_compra"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_compra_entrada_id_key" ON "pedidos_compra"("entrada_id");

-- CreateIndex
CREATE INDEX "pedidos_compra_proveedor_id_idx" ON "pedidos_compra"("proveedor_id");

-- CreateIndex
CREATE INDEX "pedidos_compra_bodega_id_idx" ON "pedidos_compra"("bodega_id");

-- CreateIndex
CREATE INDEX "pedidos_compra_estado_idx" ON "pedidos_compra"("estado");

-- CreateIndex
CREATE INDEX "pedido_compra_items_repuesto_id_idx" ON "pedido_compra_items"("repuesto_id");

-- CreateIndex
CREATE UNIQUE INDEX "pedido_compra_items_pedido_id_repuesto_id_key" ON "pedido_compra_items"("pedido_id", "repuesto_id");

-- AddForeignKey
ALTER TABLE "pedidos_compra" ADD CONSTRAINT "pedidos_compra_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_compra" ADD CONSTRAINT "pedidos_compra_bodega_id_fkey" FOREIGN KEY ("bodega_id") REFERENCES "bodegas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_compra" ADD CONSTRAINT "pedidos_compra_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_compra" ADD CONSTRAINT "pedidos_compra_entrada_id_fkey" FOREIGN KEY ("entrada_id") REFERENCES "entradas_mercancia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_compra_items" ADD CONSTRAINT "pedido_compra_items_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_compra_items" ADD CONSTRAINT "pedido_compra_items_repuesto_id_fkey" FOREIGN KEY ("repuesto_id") REFERENCES "repuestos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

