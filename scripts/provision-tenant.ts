import { execSync } from "node:child_process";
import { publicDb } from "@/lib/db/public-client";
import { getTenantDb } from "@/lib/db/tenant-client";
import { isValidTenantSlug } from "@/lib/tenant/subdomain";
import type { Tenant } from "@/generated/prisma-public";

export interface ProvisionTenantInput {
  slug: string;
  schemaName: string;
}

const SAFE_IDENTIFIER = /^[a-z][a-z0-9_]*$/;

export async function provisionTenant({ slug, schemaName }: ProvisionTenantInput): Promise<Tenant> {
  if (!isValidTenantSlug(slug)) {
    throw new Error(
      `Invalid slug: "${slug}" (must be lowercase letters/digits/hyphens, and not a reserved word)`,
    );
  }

  if (!SAFE_IDENTIFIER.test(schemaName)) {
    throw new Error(`Invalid schema name: "${schemaName}" (expected lowercase snake_case)`);
  }

  const existing = await publicDb.tenant.findFirst({ where: { OR: [{ slug }, { schemaName }] } });
  if (existing) {
    throw new Error(`Tenant already exists for slug "${slug}" or schema "${schemaName}"`);
  }

  await publicDb.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

  try {
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

    const tenant = await publicDb.tenant.create({ data: { slug, schemaName } });

    const tenantDb = getTenantDb(schemaName);
    await tenantDb.sede.create({ data: { nombre: "Sede principal" } });

    return tenant;
  } catch (err) {
    const stillExists = await publicDb.tenant.findFirst({ where: { schemaName } });
    if (!stillExists) {
      try {
        await publicDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      } catch (cleanupErr) {
        console.error(`Failed to clean up orphaned schema "${schemaName}" after provisioning error:`, cleanupErr);
      }
    }
    throw err;
  }
}
