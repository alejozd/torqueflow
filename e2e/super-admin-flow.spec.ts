import { test, expect } from "@playwright/test";
import { provisionTenant } from "../scripts/provision-tenant";
import { seedTenantUser } from "../scripts/seed-tenant-user";
import { seedSuperAdmin } from "../scripts/seed-super-admin";
import { publicDb } from "../src/lib/db/public-client";

const SLUG = "taller-e2e-superadmin";
const SCHEMA = "taller_e2e_superadmin";
const TENANT_ADMIN_EMAIL = "admin@e2e-superadmin.test";
const TENANT_ADMIN_PASSWORD = "SmokeTest123!";
const SUPERADMIN_EMAIL = "e2e-superadmin@torqueflow.test";
const SUPERADMIN_PASSWORD = "clave-e2e-super-segura";

test.beforeAll(async () => {
  await publicDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await publicDb.tenant.deleteMany({ where: { slug: SLUG } });

  await provisionTenant({ slug: SLUG, schemaName: SCHEMA });
  await seedTenantUser({
    schemaName: SCHEMA,
    email: TENANT_ADMIN_EMAIL,
    password: TENANT_ADMIN_PASSWORD,
    nombre: "Admin E2E Superadmin",
    role: "ADMIN",
  });
  await seedSuperAdmin({ email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD, nombre: "E2E Owner" });
});

test.afterAll(async () => {
  await publicDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await publicDb.tenant.deleteMany({ where: { slug: SLUG } });
  await publicDb.superAdmin.deleteMany({ where: { email: SUPERADMIN_EMAIL } });
});

test("super-admin logs in, suspends a tenant, confirms the tenant's login is blocked, then reactivates it and changes its plan", async ({
  page,
}) => {
  await page.goto("http://localhost:3000/superadmin/login");
  await page.getByLabel("Correo").fill(SUPERADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(SUPERADMIN_PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/superadmin$/);

  await expect(page.getByRole("heading", { name: "Talleres" })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: SLUG });
  await expect(row.getByRole("cell", { name: "Básico" })).toBeVisible();

  await row.getByRole("button", { name: "Suspender" }).click();
  await expect(row.getByRole("button", { name: "Activar" })).toBeVisible();

  // A suspended tenant's own login must fail the same way wrong credentials
  // would -- this phase's design decision 7, no distinct message.
  await page.goto(`http://${SLUG}.localhost:3000/login`);
  await page.getByLabel("Correo").fill(TENANT_ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(TENANT_ADMIN_PASSWORD);
  await page.getByLabel("Sede").selectOption({ label: "Sede principal" });
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByRole("alert")).toHaveText("Correo, contraseña o sede incorrectos");

  await page.goto("http://localhost:3000/superadmin");
  await row.getByRole("button", { name: "Activar" }).click();
  await expect(row.getByRole("button", { name: "Suspender" })).toBeVisible();

  await row.getByLabel("Plan").selectOption({ label: "Estándar" });
  await row.getByRole("button", { name: "Guardar plan" }).click();
  await expect(row.getByRole("cell", { name: "Estándar" })).toBeVisible();

  // Reactivated: the tenant's own login must work again.
  await page.goto(`http://${SLUG}.localhost:3000/login`);
  await page.getByLabel("Correo").fill(TENANT_ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(TENANT_ADMIN_PASSWORD);
  await page.getByLabel("Sede").selectOption({ label: "Sede principal" });
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/clientes$/);
});
