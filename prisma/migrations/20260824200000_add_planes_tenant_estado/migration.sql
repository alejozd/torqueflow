-- CreateEnum
CREATE TYPE "EstadoTenant" AS ENUM ('ACTIVO', 'SUSPENDIDO');

-- CreateTable
CREATE TABLE "planes" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio" DECIMAL(10,2),
    "max_usuarios" INTEGER,
    "max_sedes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "planes_nombre_key" ON "planes"("nombre");

-- Seed the three fixed tiers (design doc §9 suggested defaults). precio is
-- deliberately NULL -- real pricing is an explicit open decision (§10), not
-- part of this phase.
INSERT INTO "planes" ("id", "nombre", "precio", "max_usuarios", "max_sedes", "updated_at") VALUES
    ('plan_basico',   'Básico',   NULL, 3,    1,    CURRENT_TIMESTAMP),
    ('plan_estandar', 'Estándar', NULL, 10,   1,    CURRENT_TIMESTAMP),
    ('plan_avanzado', 'Avanzado', NULL, NULL, NULL, CURRENT_TIMESTAMP);

-- AlterTable: add the new columns nullable first so existing rows don't
-- reject the migration, backfill, then tighten to NOT NULL. Every tenant
-- that already exists is backfilled to Avanzado (unlimited) specifically so
-- this migration cannot newly restrict a tenant that is already live.
ALTER TABLE "tenants" ADD COLUMN "estado" "EstadoTenant" NOT NULL DEFAULT 'ACTIVO';
ALTER TABLE "tenants" ADD COLUMN "plan_id" TEXT;

UPDATE "tenants" SET "plan_id" = 'plan_avanzado' WHERE "plan_id" IS NULL;

ALTER TABLE "tenants" ALTER COLUMN "plan_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "tenants_plan_id_idx" ON "tenants"("plan_id");

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "planes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
