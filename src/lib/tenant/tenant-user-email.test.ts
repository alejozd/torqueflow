import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { publicDb } from "@/lib/db/public-client";
import { provisionTenant } from "../../../scripts/provision-tenant";
import { claimTenantUserEmail, releaseTenantUserEmail, TenantUserEmailConflictError } from "./tenant-user-email";

const SLUG_A = "test-task4-email-a";
const SCHEMA_A = "test_task4_email_a";
const SLUG_B = "test-task4-email-b";
const SCHEMA_B = "test_task4_email_b";

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

describe("claimTenantUserEmail", () => {
  it("creates a TenantUserEmail row pointing at the tenant identified by schemaName", async () => {
    const email = "claim-a@task4-fixture.test";

    await claimTenantUserEmail(SCHEMA_A, email);

    const tenant = await publicDb.tenant.findUniqueOrThrow({ where: { schemaName: SCHEMA_A } });
    const row = await publicDb.tenantUserEmail.findUnique({ where: { email } });
    expect(row?.tenantId).toBe(tenant.id);
  });

  it("is idempotent: claiming the same email for the same tenant again does not throw", async () => {
    const email = "claim-idempotent@task4-fixture.test";

    await claimTenantUserEmail(SCHEMA_A, email);
    await expect(claimTenantUserEmail(SCHEMA_A, email)).resolves.toBeUndefined();
  });

  it("throws TenantUserEmailConflictError and does not modify the row when the email belongs to a different tenant", async () => {
    const email = "claim-conflict@task4-fixture.test";
    await claimTenantUserEmail(SCHEMA_A, email);

    await expect(claimTenantUserEmail(SCHEMA_B, email)).rejects.toThrow(TenantUserEmailConflictError);

    const tenantA = await publicDb.tenant.findUniqueOrThrow({ where: { schemaName: SCHEMA_A } });
    const row = await publicDb.tenantUserEmail.findUnique({ where: { email } });
    expect(row?.tenantId).toBe(tenantA.id);
  });
});

describe("releaseTenantUserEmail", () => {
  it("deletes an existing mapping", async () => {
    const email = "release-me@task4-fixture.test";
    await claimTenantUserEmail(SCHEMA_A, email);

    await releaseTenantUserEmail(email);

    const row = await publicDb.tenantUserEmail.findUnique({ where: { email } });
    expect(row).toBeNull();
  });

  it("does not throw when the email has no mapping", async () => {
    await expect(releaseTenantUserEmail("never-claimed@task4-fixture.test")).resolves.toBeUndefined();
  });
});
