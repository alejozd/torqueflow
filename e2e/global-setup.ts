import "dotenv/config";
import { provisionTenant } from "../scripts/provision-tenant";
import { seedTenantUser } from "../scripts/seed-tenant-user";
import { publicDb } from "../src/lib/db/public-client";

export const E2E_SLUG = "taller-e2e-smoke";
export const E2E_SCHEMA = "taller_e2e_smoke";
export const E2E_ADMIN_EMAIL = "admin@e2e-smoke.test";
export const E2E_ADMIN_PASSWORD = "SmokeTest123!";
export const E2E_TECNICO_EMAIL = "tecnico@e2e-smoke.test";
export const E2E_TECNICO_PASSWORD = "SmokeTest123!";
export const E2E_TECNICO_NOMBRE = "Tec E2E";
export const E2E_RECEPCION_EMAIL = "recepcion@e2e-smoke.test";
export const E2E_RECEPCION_PASSWORD = "SmokeTest123!";
export const E2E_RECEPCION_NOMBRE = "Recep E2E";

export default async function globalSetup() {
  await publicDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${E2E_SCHEMA}" CASCADE`);
  await publicDb.tenant.deleteMany({ where: { slug: E2E_SLUG } });

  await provisionTenant({ slug: E2E_SLUG, schemaName: E2E_SCHEMA });

  // provisionTenant defaults every new tenant to the Básico plan (Fase 9),
  // whose maxSedes=1 would block this suite's own "Sede norte" creation
  // further down -- this smoke test exercises multi-sede end to end, which
  // is Avanzado-tier behavior, so it needs that plan explicitly, the same
  // way a real customer would need to upgrade to test it.
  const planAvanzado = await publicDb.plan.findUniqueOrThrow({ where: { nombre: "Avanzado" } });
  await publicDb.tenant.update({ where: { slug: E2E_SLUG }, data: { planId: planAvanzado.id } });

  await seedTenantUser({
    schemaName: E2E_SCHEMA,
    email: E2E_ADMIN_EMAIL,
    password: E2E_ADMIN_PASSWORD,
    nombre: "Admin E2E",
    role: "ADMIN",
  });
  await seedTenantUser({
    schemaName: E2E_SCHEMA,
    email: E2E_TECNICO_EMAIL,
    password: E2E_TECNICO_PASSWORD,
    nombre: E2E_TECNICO_NOMBRE,
    role: "TECNICO",
  });
  // seedTenantUser grants the tenant's oldest sede ("Sede principal"), which is
  // exactly what the cita isolation assertions below need: this user works in
  // Sede principal only.
  await seedTenantUser({
    schemaName: E2E_SCHEMA,
    email: E2E_RECEPCION_EMAIL,
    password: E2E_RECEPCION_PASSWORD,
    nombre: E2E_RECEPCION_NOMBRE,
    role: "RECEPCION",
  });
}
