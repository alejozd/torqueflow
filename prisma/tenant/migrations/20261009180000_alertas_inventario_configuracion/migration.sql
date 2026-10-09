-- AlterTable
ALTER TABLE "proveedores" ADD COLUMN     "dias_entrega" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "repuestos" ADD COLUMN     "alerta_pospuesta_hasta" TIMESTAMP(3),
ADD COLUMN     "multiplo_compra" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "stock_maximo" INTEGER;

