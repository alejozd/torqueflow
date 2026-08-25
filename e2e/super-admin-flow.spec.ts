import { test, expect } from "@playwright/test";
import { provisionTenant } from "../scripts/provision-tenant";
import { seedTenantUser } from "../scripts/seed-tenant-user";
import { seedSuperAdmin } from "../scripts/seed-super-admin";
import { publicDb } from "../src/lib/db/public-client";
import { login } from "./login-helper";

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

  // Next.js dev mode (Turbopack) compiles each route on first hit. This spec
  // runs concurrently with tenant-flow.spec.ts, which is compiling a much
  // larger set of routes at the same time -- under that load, this login's
  // very first /api/superadmin/auth/csrf (or /api/auth/csrf) request has been
  // observed to race the still-compiling route and come back with an
  // empty/stale CSRF token, producing a MissingCSRF error on the subsequent
  // sign-in POST. Warming up both auth systems here, sequentially, before the
  // real page navigation begins, moves that one-time compile cost off the
  // timing-sensitive login flow. Fase 10: both routes are host-agnostic now
  // (one URL, no tenant subdomain), so no Host-header spoofing is needed.
  await fetch("http://localhost:3000/superadmin/login");
  await fetch("http://localhost:3000/api/superadmin/auth/csrf");
  await fetch("http://localhost:3000/login");
  await fetch("http://localhost:3000/api/auth/csrf");
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
  await expect(row.getByRole("cell", { name: "Básico", exact: true })).toBeVisible();

  await row.getByRole("button", { name: "Suspender" }).click();
  await expect(row.getByRole("button", { name: "Activar" })).toBeVisible();

  // A suspended tenant's own login must fail the same way wrong credentials
  // would -- this phase's design decision 7, no distinct message. Not using
  // the login() helper here: this login is expected to FAIL, so it must
  // never reach /clientes or /seleccionar-sede.
  await page.goto("/login");
  await page.getByLabel("Correo").fill(TENANT_ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(TENANT_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "incorrectos" })).toHaveText(
    "Correo o contraseña incorrectos",
  );

  await page.goto("http://localhost:3000/superadmin");
  await row.getByRole("button", { name: "Activar" }).click();
  await expect(row.getByRole("button", { name: "Suspender" })).toBeVisible();

  await row.getByLabel("Plan").selectOption({ label: "Estándar" });
  await row.getByRole("button", { name: "Guardar plan" }).click();
  await expect(row.getByRole("cell", { name: "Estándar", exact: true })).toBeVisible();

  // Reactivated: the tenant's own login must work again.
  await page.goto("/login");
  await login(page, TENANT_ADMIN_EMAIL, TENANT_ADMIN_PASSWORD, "Sede principal");
});
