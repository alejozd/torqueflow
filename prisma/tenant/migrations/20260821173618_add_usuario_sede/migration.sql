-- CreateTable
CREATE TABLE "usuario_sedes" (
    "usuario_id" TEXT NOT NULL,
    "sede_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_sedes_pkey" PRIMARY KEY ("usuario_id","sede_id")
);

-- CreateIndex
CREATE INDEX "usuario_sedes_sede_id_idx" ON "usuario_sedes"("sede_id");

-- AddForeignKey
ALTER TABLE "usuario_sedes" ADD CONSTRAINT "usuario_sedes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_sedes" ADD CONSTRAINT "usuario_sedes_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: grant every pre-existing Usuario the tenant's oldest Sede.
-- Without this, the login sede gate introduced in Fase 6 Task 6 locks every
-- existing TECNICO/RECEPCION out of every already-provisioned tenant, because
-- they have no UsuarioSede row. The oldest sede is the "Sede principal" that
-- provisionTenant has created since Fase 2, i.e. the sede those users have
-- implicitly been working in all along. On a freshly provisioned schema both
-- tables are empty and this inserts zero rows.
INSERT INTO "usuario_sedes" ("usuario_id", "sede_id", "created_at")
SELECT u."id", s."id", CURRENT_TIMESTAMP
FROM "usuarios" u
CROSS JOIN (
    SELECT "id" FROM "sedes" ORDER BY "created_at" ASC LIMIT 1
) s;
