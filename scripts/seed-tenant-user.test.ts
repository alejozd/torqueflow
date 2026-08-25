import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { publicDb } from "@/lib/db/public-client";
import { getTenantDb } from "@/lib/db/tenant-client";
import { provisionTenant } from "./provision-tenant";
import { seedTenantUser } from "./seed-tenant-user";

const SLUG = "test-task6-seed-fixture";
const SCHEMA = "test_task6_seed_fixture";

beforeAll(async () => {
  await provisionTenant({ slug: SLUG, schemaName: SCHEMA });
});

afterAll(async () => {
  await publicDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await publicDb.tenant.deleteMany({ where: { slug: SLUG } });
});

describe("seedTenantUser", () => {
  it("creates a Usuario with a bcrypt-hashed password and the requested role", async () => {
    const usuario = await seedTenantUser({
      schemaName: SCHEMA,
      email: "admin@task6-fixture.test",
      password: "SuperSecret123!",
      nombre: "Admin Fixture",
      role: "ADMIN",
    });

    expect(usuario.role).toBe("ADMIN");
    expect(usuario.passwordHash).not.toBe("SuperSecret123!");
    expect(await bcrypt.compare("SuperSecret123!", usuario.passwordHash)).toBe(true);

    const tenantDb = getTenantDb(SCHEMA);
    const found = await tenantDb.usuario.findUnique({ where: { email: "admin@task6-fixture.test" } });
    expect(found?.id).toBe(usuario.id);
  });

  it("assigns the seeded user to the tenant's oldest sede", async () => {
    const usuario = await seedTenantUser({
      schemaName: SCHEMA,
      email: "sede-grant@example.test",
      password: "SuperSecret123!",
      nombre: "Con Sede",
      role: "TECNICO",
    });

    const tenantDb = getTenantDb(SCHEMA);
    const sedeMasAntigua = await tenantDb.sede.findFirst({ orderBy: { createdAt: "asc" } });
    const grants = await tenantDb.usuarioSede.findMany({ where: { usuarioId: usuario.id } });

    expect(grants).toHaveLength(1);
    expect(grants[0].sedeId).toBe(sedeMasAntigua?.id);
  });

  it("registers the email in the public tenant_user_emails index", async () => {
    const usuario = await seedTenantUser({
      schemaName: SCHEMA,
      email: "indexed@task6-fixture.test",
      password: "SuperSecret123!",
      nombre: "Indexado",
    });

    const tenant = await publicDb.tenant.findUniqueOrThrow({ where: { slug: SLUG } });
    const row = await publicDb.tenantUserEmail.findUnique({ where: { email: usuario.email } });
    expect(row?.tenantId).toBe(tenant.id);
  });

  it("is idempotent: re-seeding the same email does not duplicate the sede grant", async () => {
    const first = await seedTenantUser({
      schemaName: SCHEMA,
      email: "sede-idempotente@example.test",
      password: "SuperSecret123!",
      nombre: "Repetido",
    });
    const second = await seedTenantUser({
      schemaName: SCHEMA,
      email: "sede-idempotente@example.test",
      password: "OtraClave456!",
      nombre: "Repetido",
    });

    expect(second.id).toBe(first.id);

    const tenantDb = getTenantDb(SCHEMA);
    const grants = await tenantDb.usuarioSede.findMany({ where: { usuarioId: first.id } });
    expect(grants).toHaveLength(1);
  });
});
