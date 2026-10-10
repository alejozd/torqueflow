-- CreateEnum
CREATE TYPE "EstadoAnticipo" AS ENUM ('PENDIENTE', 'APLICADO', 'DEVUELTO');

-- AlterEnum
ALTER TYPE "MetodoPago" ADD VALUE 'ANTICIPO';

-- AlterTable
ALTER TABLE "gastos" ADD COLUMN     "pagado_en_efectivo" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "anticipos" (
    "id" TEXT NOT NULL,
    "orden_id" TEXT NOT NULL,
    "sede_id" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "metodo_pago" "MetodoPago" NOT NULL,
    "referencia" TEXT,
    "estado" "EstadoAnticipo" NOT NULL DEFAULT 'PENDIENTE',
    "registrado_por_id" TEXT NOT NULL,
    "pago_id" TEXT,
    "devuelto_at" TIMESTAMP(3),
    "devuelto_por_id" TEXT,
    "metodo_devolucion" "MetodoPago",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anticipos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cajas_sesion" (
    "id" TEXT NOT NULL,
    "sede_id" TEXT NOT NULL,
    "base_inicial" DECIMAL(12,2) NOT NULL,
    "abierta_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "abierta_por_id" TEXT NOT NULL,
    "cerrada_at" TIMESTAMP(3),
    "cerrada_por_id" TEXT,
    "efectivo_esperado" DECIMAL(12,2),
    "efectivo_contado" DECIMAL(12,2),
    "notas" TEXT,

    CONSTRAINT "cajas_sesion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "anticipos_pago_id_key" ON "anticipos"("pago_id");

-- CreateIndex
CREATE INDEX "anticipos_orden_id_idx" ON "anticipos"("orden_id");

-- CreateIndex
CREATE INDEX "anticipos_sede_id_created_at_idx" ON "anticipos"("sede_id", "created_at");

-- CreateIndex
CREATE INDEX "cajas_sesion_sede_id_abierta_at_idx" ON "cajas_sesion"("sede_id", "abierta_at");

-- AddForeignKey
ALTER TABLE "anticipos" ADD CONSTRAINT "anticipos_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "ordenes_trabajo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anticipos" ADD CONSTRAINT "anticipos_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anticipos" ADD CONSTRAINT "anticipos_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anticipos" ADD CONSTRAINT "anticipos_pago_id_fkey" FOREIGN KEY ("pago_id") REFERENCES "pagos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anticipos" ADD CONSTRAINT "anticipos_devuelto_por_id_fkey" FOREIGN KEY ("devuelto_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cajas_sesion" ADD CONSTRAINT "cajas_sesion_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cajas_sesion" ADD CONSTRAINT "cajas_sesion_abierta_por_id_fkey" FOREIGN KEY ("abierta_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cajas_sesion" ADD CONSTRAINT "cajas_sesion_cerrada_por_id_fkey" FOREIGN KEY ("cerrada_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Una sola caja abierta por sede (índice parcial; Prisma no lo modela)
CREATE UNIQUE INDEX "cajas_sesion_una_abierta_por_sede" ON "cajas_sesion"("sede_id") WHERE "cerrada_at" IS NULL;
