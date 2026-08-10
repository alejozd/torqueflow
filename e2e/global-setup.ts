import "dotenv/config";
import { provisionTenant } from "../scripts/provision-tenant";
import { seedTenantUser } from "../scripts/seed-tenant-user";
import { publicDb } from "../src/lib/db/public-client";

export const E2E_SLUG = "taller-e2e-smoke";
export const E2E_SCHEMA = "taller_e2e_smoke";
export const E2E_ADMIN_EMAIL = "admin@e2e-smoke.test";
export const E2E_ADMIN_PASSWORD = "SmokeTest123!";

export default async function globalSetup() {
  await publicDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${E2E_SCHEMA}" CASCADE`);
  await publicDb.tenant.deleteMany({ where: { slug: E2E_SLUG } });

  await provisionTenant({ slug: E2E_SLUG, schemaName: E2E_SCHEMA });
  await seedTenantUser({
    schemaName: E2E_SCHEMA,
    email: E2E_ADMIN_EMAIL,
    password: E2E_ADMIN_PASSWORD,
    nombre: "Admin E2E",
    role: "ADMIN",
  });
}
