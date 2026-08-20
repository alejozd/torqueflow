-- CreateTable
CREATE TABLE "bodegas" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "sede_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bodegas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedores" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "contacto" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bodegas_sede_id_idx" ON "bodegas"("sede_id");

-- AddForeignKey
ALTER TABLE "bodegas" ADD CONSTRAINT "bodegas_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
