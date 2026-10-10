-- CreateTable
CREATE TABLE "categorias_gasto" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categorias_gasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gastos" (
    "id" TEXT NOT NULL,
    "sede_id" TEXT NOT NULL,
    "categoria_id" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "fecha" DATE NOT NULL,
    "referencia" TEXT,
    "gasto_recurrente_id" TEXT,
    "periodo" TEXT,
    "registrado_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gastos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gastos_recurrentes" (
    "id" TEXT NOT NULL,
    "sede_id" TEXT NOT NULL,
    "categoria_id" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "monto_estimado" DECIMAL(12,2) NOT NULL,
    "dia_del_mes" INTEGER NOT NULL,
    "desde" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gastos_recurrentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gastos_recurrentes_omitidos" (
    "id" TEXT NOT NULL,
    "gasto_recurrente_id" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "omitido_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gastos_recurrentes_omitidos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categorias_gasto_nombre_key" ON "categorias_gasto"("nombre");

-- CreateIndex
CREATE INDEX "gastos_sede_id_fecha_idx" ON "gastos"("sede_id", "fecha");

-- CreateIndex
CREATE INDEX "gastos_categoria_id_idx" ON "gastos"("categoria_id");

-- CreateIndex
CREATE UNIQUE INDEX "gastos_gasto_recurrente_id_periodo_key" ON "gastos"("gasto_recurrente_id", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX "gastos_recurrentes_omitidos_gasto_recurrente_id_periodo_key" ON "gastos_recurrentes_omitidos"("gasto_recurrente_id", "periodo");

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias_gasto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_gasto_recurrente_id_fkey" FOREIGN KEY ("gasto_recurrente_id") REFERENCES "gastos_recurrentes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_recurrentes" ADD CONSTRAINT "gastos_recurrentes_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_recurrentes" ADD CONSTRAINT "gastos_recurrentes_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias_gasto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_recurrentes_omitidos" ADD CONSTRAINT "gastos_recurrentes_omitidos_gasto_recurrente_id_fkey" FOREIGN KEY ("gasto_recurrente_id") REFERENCES "gastos_recurrentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_recurrentes_omitidos" ADD CONSTRAINT "gastos_recurrentes_omitidos_omitido_por_id_fkey" FOREIGN KEY ("omitido_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Seed: categorías de gasto por defecto (el aprovisionamiento de tenants corre
-- migrate deploy, así que esto cubre talleres existentes y nuevos).
INSERT INTO "categorias_gasto" ("id", "nombre", "orden") VALUES
  ('cat_arriendo', 'Arriendo', 0),
  ('cat_servicios_publicos', 'Servicios públicos', 1),
  ('cat_nomina', 'Nómina', 2),
  ('cat_seguridad_social', 'Seguridad social', 3),
  ('cat_herramientas_equipos', 'Herramientas y equipos', 4),
  ('cat_insumos', 'Insumos', 5),
  ('cat_mantenimiento_local', 'Mantenimiento del local', 6),
  ('cat_impuestos', 'Impuestos', 7),
  ('cat_publicidad', 'Publicidad', 8),
  ('cat_transporte', 'Transporte', 9),
  ('cat_otros', 'Otros', 10);
