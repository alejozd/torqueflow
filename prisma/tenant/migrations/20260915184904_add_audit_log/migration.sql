-- CreateEnum
CREATE TYPE "TipoEventoAuditoria" AS ENUM ('ORDEN_ANULAR', 'USUARIO_ACTUALIZAR_PERMISOS', 'USUARIO_ELIMINAR', 'BODEGA_ELIMINAR');

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "tipo" "TipoEventoAuditoria" NOT NULL,
    "actor_id" TEXT,
    "entidad_tipo" TEXT NOT NULL,
    "entidad_id" TEXT NOT NULL,
    "detalle" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_tipo_created_at_idx" ON "audit_log"("tipo", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_entidad_tipo_entidad_id_idx" ON "audit_log"("entidad_tipo", "entidad_id");

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
