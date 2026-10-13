-- AlterEnum
ALTER TYPE "TipoEventoAuditoria" ADD VALUE 'VENTA_DEVOLVER';

-- CreateTable
CREATE TABLE "ventas_mostrador" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "estado" "EstadoFactura" NOT NULL DEFAULT 'PENDIENTE',
    "sede_id" TEXT NOT NULL,
    "cliente_id" TEXT,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "descuento" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "iva" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "saldo_pendiente" DECIMAL(10,2) NOT NULL,
    "creado_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ventas_mostrador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venta_mostrador_items" (
    "id" TEXT NOT NULL,
    "venta_id" TEXT NOT NULL,
    "repuesto_id" TEXT,
    "descripcion" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_unitario" DECIMAL(10,2) NOT NULL,
    "devuelto_cantidad" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venta_mostrador_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagos_venta_mostrador" (
    "id" TEXT NOT NULL,
    "venta_id" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "metodo_pago" "MetodoPago" NOT NULL,
    "referencia" TEXT,
    "registrado_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_venta_mostrador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devoluciones_mostrador" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "venta_id" TEXT NOT NULL,
    "sede_id" TEXT NOT NULL,
    "motivo" TEXT,
    "total" DECIMAL(10,2) NOT NULL,
    "metodo_pago" "MetodoPago" NOT NULL,
    "creado_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devoluciones_mostrador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devolucion_mostrador_items" (
    "id" TEXT NOT NULL,
    "devolucion_id" TEXT NOT NULL,
    "venta_item_id" TEXT NOT NULL,
    "repuesto_id" TEXT,
    "cantidad" INTEGER NOT NULL,
    "precio_unitario" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devolucion_mostrador_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuentas_por_pagar" (
    "id" TEXT NOT NULL,
    "entrada_id" TEXT NOT NULL,
    "proveedor_id" TEXT NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "saldo_pendiente" DECIMAL(10,2) NOT NULL,
    "estado" "EstadoFactura" NOT NULL DEFAULT 'PENDIENTE',
    "fecha" DATE NOT NULL,
    "creado_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cuentas_por_pagar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagos_proveedor" (
    "id" TEXT NOT NULL,
    "cuenta_id" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "metodo_pago" "MetodoPago" NOT NULL,
    "referencia" TEXT,
    "registrado_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ventas_mostrador_numero_key" ON "ventas_mostrador"("numero");

-- CreateIndex
CREATE INDEX "ventas_mostrador_sede_id_created_at_idx" ON "ventas_mostrador"("sede_id", "created_at");

-- CreateIndex
CREATE INDEX "ventas_mostrador_cliente_id_idx" ON "ventas_mostrador"("cliente_id");

-- CreateIndex
CREATE INDEX "venta_mostrador_items_venta_id_idx" ON "venta_mostrador_items"("venta_id");

-- CreateIndex
CREATE INDEX "venta_mostrador_items_repuesto_id_idx" ON "venta_mostrador_items"("repuesto_id");

-- CreateIndex
CREATE INDEX "pagos_venta_mostrador_venta_id_idx" ON "pagos_venta_mostrador"("venta_id");

-- CreateIndex
CREATE UNIQUE INDEX "devoluciones_mostrador_numero_key" ON "devoluciones_mostrador"("numero");

-- CreateIndex
CREATE INDEX "devoluciones_mostrador_venta_id_idx" ON "devoluciones_mostrador"("venta_id");

-- CreateIndex
CREATE INDEX "devoluciones_mostrador_sede_id_created_at_idx" ON "devoluciones_mostrador"("sede_id", "created_at");

-- CreateIndex
CREATE INDEX "devolucion_mostrador_items_devolucion_id_idx" ON "devolucion_mostrador_items"("devolucion_id");

-- CreateIndex
CREATE INDEX "devolucion_mostrador_items_venta_item_id_idx" ON "devolucion_mostrador_items"("venta_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_por_pagar_entrada_id_key" ON "cuentas_por_pagar"("entrada_id");

-- CreateIndex
CREATE INDEX "cuentas_por_pagar_proveedor_id_estado_idx" ON "cuentas_por_pagar"("proveedor_id", "estado");

-- CreateIndex
CREATE INDEX "pagos_proveedor_cuenta_id_idx" ON "pagos_proveedor"("cuenta_id");

-- AddForeignKey
ALTER TABLE "ventas_mostrador" ADD CONSTRAINT "ventas_mostrador_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas_mostrador" ADD CONSTRAINT "ventas_mostrador_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas_mostrador" ADD CONSTRAINT "ventas_mostrador_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_mostrador_items" ADD CONSTRAINT "venta_mostrador_items_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas_mostrador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_mostrador_items" ADD CONSTRAINT "venta_mostrador_items_repuesto_id_fkey" FOREIGN KEY ("repuesto_id") REFERENCES "repuestos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_venta_mostrador" ADD CONSTRAINT "pagos_venta_mostrador_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas_mostrador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_venta_mostrador" ADD CONSTRAINT "pagos_venta_mostrador_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoluciones_mostrador" ADD CONSTRAINT "devoluciones_mostrador_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas_mostrador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoluciones_mostrador" ADD CONSTRAINT "devoluciones_mostrador_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoluciones_mostrador" ADD CONSTRAINT "devoluciones_mostrador_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devolucion_mostrador_items" ADD CONSTRAINT "devolucion_mostrador_items_devolucion_id_fkey" FOREIGN KEY ("devolucion_id") REFERENCES "devoluciones_mostrador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devolucion_mostrador_items" ADD CONSTRAINT "devolucion_mostrador_items_venta_item_id_fkey" FOREIGN KEY ("venta_item_id") REFERENCES "venta_mostrador_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devolucion_mostrador_items" ADD CONSTRAINT "devolucion_mostrador_items_repuesto_id_fkey" FOREIGN KEY ("repuesto_id") REFERENCES "repuestos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas_por_pagar" ADD CONSTRAINT "cuentas_por_pagar_entrada_id_fkey" FOREIGN KEY ("entrada_id") REFERENCES "entradas_mercancia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas_por_pagar" ADD CONSTRAINT "cuentas_por_pagar_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas_por_pagar" ADD CONSTRAINT "cuentas_por_pagar_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_proveedor" ADD CONSTRAINT "pagos_proveedor_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas_por_pagar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_proveedor" ADD CONSTRAINT "pagos_proveedor_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
