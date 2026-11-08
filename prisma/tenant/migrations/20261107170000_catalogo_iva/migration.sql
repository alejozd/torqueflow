-- AlterTable
ALTER TABLE "repuestos" ADD COLUMN "iva_pct" DECIMAL(5,2) NOT NULL DEFAULT 19;

-- AlterTable
ALTER TABLE "servicios" ADD COLUMN "iva_pct" DECIMAL(5,2) NOT NULL DEFAULT 19;
