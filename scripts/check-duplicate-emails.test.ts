import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { publicDb } from "@/lib/db/public-client";
import { getTenantDb } from "@/lib/db/tenant-client";
import { provisionTenant } from "./provision-tenant";
import { checkDuplicateEmails } from "./check-duplicate-emails";

const SLUG_A = "test-task1-dup-a";
const SCHEMA_A = "test_task1_dup_a";
const SLUG_B = "test-task1-dup-b";
const SCHEMA_B = "test_task1_dup_b";

async function dropTenant(slug: string, schemaName: string) {
  await publicDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await publicDb.tenant.deleteMany({ where: { slug } });
}

beforeAll(async () => {
  await provisionTenant({ slug: SLUG_A, schemaName: SCHEMA_A });
  await provisionTenant({ slug: SLUG_B, schemaName: SCHEMA_B });
});

afterAll(async () => {
  await dropTenant(SLUG_A, SCHEMA_A);
  await dropTenant(SLUG_B, SCHEMA_B);
});

describe("checkDuplicateEmails", () => {
  it("reports an email that exists in more than one tenant schema", async () => {
    const email = "shared@task1-fixture.test";
    await getTenantDb(SCHEMA_A).usuario.create({
      data: { email, passwordHash: "x", nombre: "A", role: "ADMIN" },
    });
    await getTenantDb(SCHEMA_B).usuario.create({
      data: { email, passwordHash: "x", nombre: "B", role: "ADMIN" },
    });

    const duplicates = await checkDuplicateEmails();
    const found = duplicates.find((d) => d.email === email);

    expect(found).toBeDefined();
    expect(found?.tenantSlugs.sort()).toEqual([SLUG_A, SLUG_B].sort());
  });

  it("does not report an email that exists in only one tenant schema", async () => {
    const email = "unique@task1-fixture.test";
    await getTenantDb(SCHEMA_A).usuario.create({
      data: { email, passwordHash: "x", nombre: "Unico", role: "ADMIN" },
    });

    const duplicates = await checkDuplicateEmails();
    expect(duplicates.find((d) => d.email === email)).toBeUndefined();
  });
});
