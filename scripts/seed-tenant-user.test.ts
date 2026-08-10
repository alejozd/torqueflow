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
});
