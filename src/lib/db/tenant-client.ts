import { PrismaClient as TenantPrismaClient } from "@/generated/prisma-tenant";

export type { TenantPrismaClient };

function buildTenantConnectionString(schemaName: string): string {
  const base = process.env.TENANT_DATABASE_BASE_URL;
  if (!base) {
    throw new Error("TENANT_DATABASE_BASE_URL is not set");
  }
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}schema=${encodeURIComponent(schemaName)}`;
}

const tenantClientCache = new Map<string, TenantPrismaClient>();

export function getTenantDb(schemaName: string): TenantPrismaClient {
  const cached = tenantClientCache.get(schemaName);
  if (cached) return cached;

  const client = new TenantPrismaClient({
    datasourceUrl: buildTenantConnectionString(schemaName),
  });
  tenantClientCache.set(schemaName, client);
  return client;
}
