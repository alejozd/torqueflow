import { execSync } from "node:child_process";
import { publicDb } from "@/lib/db/public-client";
import type { Tenant } from "@/generated/prisma-public";

export interface ProvisionTenantInput {
  slug: string;
  schemaName: string;
}

const SAFE_IDENTIFIER = /^[a-z][a-z0-9_]*$/;

export async function provisionTenant({ slug, schemaName }: ProvisionTenantInput): Promise<Tenant> {
  if (!SAFE_IDENTIFIER.test(schemaName)) {
    throw new Error(`Invalid schema name: "${schemaName}" (expected lowercase snake_case)`);
  }

  await publicDb.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

  const base = process.env.TENANT_DATABASE_BASE_URL;
  if (!base) {
    throw new Error("TENANT_DATABASE_BASE_URL is not set");
  }
  const separator = base.includes("?") ? "&" : "?";
  const tenantUrl = `${base}${separator}schema=${schemaName}`;

  execSync("npx prisma migrate deploy --schema=prisma/tenant/schema.prisma", {
    env: { ...process.env, TENANT_DATABASE_URL: tenantUrl },
    stdio: "inherit",
  });

  return publicDb.tenant.create({ data: { slug, schemaName } });
}
