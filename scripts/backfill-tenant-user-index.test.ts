import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { publicDb } from "@/lib/db/public-client";
import { getTenantDb } from "@/lib/db/tenant-client";
import { provisionTenant } from "./provision-tenant";
import { backfillTenantUserIndex } from "./backfill-tenant-user-index";

const SLUG_A = "test-task3-backfill-a";
const SCHEMA_A = "test_task3_backfill_a";
const SLUG_B = "test-task3-backfill-b";
const SCHEMA_B = "test_task3_backfill_b";

async function dropTenant(slug: string, schemaName: string) {
  await publicDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await publicDb.tenant.deleteMany({ where: { slug } });
}

let tenantAId: string;
let tenantBId: string;

beforeAll(async () => {
  const tenantA = await provisionTenant({ slug: SLUG_A, schemaName: SCHEMA_A });
  const tenantB = await provisionTenant({ slug: SLUG_B, schemaName: SCHEMA_B });
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;
});

afterAll(async () => {
  await dropTenant(SLUG_A, SCHEMA_A);
  await dropTenant(SLUG_B, SCHEMA_B);
});

describe("backfillTenantUserIndex", () => {
  it("inserts a TenantUserEmail row for each Usuario email found in a tenant schema", async () => {
    const email = "backfill-a@task3-fixture.test";
    await getTenantDb(SCHEMA_A).usuario.create({
      data: { email, passwordHash: "x", nombre: "A", role: "ADMIN" },
    });

    const result = await backfillTenantUserIndex();

    expect(result.inserted).toBeGreaterThanOrEqual(1);
    const row = await publicDb.tenantUserEmail.findUnique({ where: { email } });
    expect(row?.tenantId).toBe(tenantAId);
  });

  it("is idempotent: re-running reports the same emails as already correct", async () => {
    const email = "backfill-idempotent@task3-fixture.test";
    await getTenantDb(SCHEMA_A).usuario.create({
      data: { email, passwordHash: "x", nombre: "Idempotente", role: "ADMIN" },
    });

    await backfillTenantUserIndex();
    const second = await backfillTenantUserIndex();

    expect(second.alreadyCorrect).toBeGreaterThanOrEqual(1);
    const row = await publicDb.tenantUserEmail.findUnique({ where: { email } });
    expect(row?.tenantId).toBe(tenantAId);
  });

  it("reports a conflict and does not overwrite an email already mapped to a different tenant", async () => {
    const email = "conflict@task3-fixture.test";
    await getTenantDb(SCHEMA_B).usuario.create({
      data: { email, passwordHash: "x", nombre: "Conflicto", role: "ADMIN" },
    });
    await publicDb.tenantUserEmail.create({ data: { email, tenantId: tenantAId } });

    const result = await backfillTenantUserIndex();

    expect(result.conflicts.some((c) => c.email === email)).toBe(true);
    const row = await publicDb.tenantUserEmail.findUnique({ where: { email } });
    expect(row?.tenantId).toBe(tenantAId);
  });
});
