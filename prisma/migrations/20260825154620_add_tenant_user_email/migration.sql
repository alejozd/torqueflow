-- CreateTable
CREATE TABLE "tenant_user_emails" (
    "email" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_user_emails_pkey" PRIMARY KEY ("email")
);

-- CreateIndex
CREATE INDEX "tenant_user_emails_tenant_id_idx" ON "tenant_user_emails"("tenant_id");

-- AddForeignKey
ALTER TABLE "tenant_user_emails" ADD CONSTRAINT "tenant_user_emails_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
