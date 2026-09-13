import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { publicDb } from "@/lib/db/public-client";
import { getTenantDb } from "@/lib/db/tenant-client";
import { provisionTenant } from "./provision-tenant";
import { backfillDviChecklistItems } from "./backfill-dvi-checklist-items";

const SLUG = "test-dvi-checklist-backfill";
const SCHEMA = "test_dvi_checklist_backfill";

async function dropTenant() {
  await publicDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await publicDb.tenant.deleteMany({ where: { slug: SLUG } });
}

beforeAll(async () => {
  await provisionTenant({ slug: SLUG, schemaName: SCHEMA });
});

afterAll(dropTenant);

describe("backfillDviChecklistItems", () => {
  it("seeds the 8 defaults for a tenant that has none", async () => {
    const tenantDb = getTenantDb(SCHEMA);
    await tenantDb.dviChecklistItem.deleteMany();

    const result = await backfillDviChecklistItems();

    expect(result.seeded).toBeGreaterThanOrEqual(1);
    const items = await tenantDb.dviChecklistItem.findMany();
    expect(items).toHaveLength(8);
  });

  it("is idempotent: skips a tenant that already has items", async () => {
    await backfillDviChecklistItems();

    const result = await backfillDviChecklistItems();

    expect(result.alreadySeeded).toBeGreaterThanOrEqual(1);
    const tenantDb = getTenantDb(SCHEMA);
    expect(await tenantDb.dviChecklistItem.count()).toBe(8);
  });
});
