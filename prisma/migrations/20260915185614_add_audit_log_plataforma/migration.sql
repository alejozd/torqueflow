-- CreateEnum
CREATE TYPE "TipoEventoAuditoriaPlataforma" AS ENUM ('TENANT_CREAR', 'TENANT_CAMBIAR_PLAN', 'TENANT_CAMBIAR_ESTADO');

-- CreateTable
CREATE TABLE "audit_log_plataforma" (
    "id" TEXT NOT NULL,
    "tipo" "TipoEventoAuditoriaPlataforma" NOT NULL,
    "super_admin_id" TEXT,
    "tenant_id" TEXT,
    "detalle" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_plataforma_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_plataforma_tipo_created_at_idx" ON "audit_log_plataforma"("tipo", "created_at");

-- AddForeignKey
ALTER TABLE "audit_log_plataforma" ADD CONSTRAINT "audit_log_plataforma_super_admin_id_fkey" FOREIGN KEY ("super_admin_id") REFERENCES "super_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log_plataforma" ADD CONSTRAINT "audit_log_plataforma_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
