import { afterEach, describe, expect, it } from "vitest";
import { publicDb } from "@/lib/db/public-client";
import { getTenantDb } from "@/lib/db/tenant-client";
import { provisionTenant } from "./provision-tenant";

const SLUG = "test-task6-fixture";
const SCHEMA = "test_task6_fixture";

async function dropTestSchema() {
  await publicDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await publicDb.tenant.deleteMany({ where: { slug: SLUG } });
}

describe("provisionTenant", () => {
  afterEach(dropTestSchema);

  it("creates the Postgres schema, applies tenant migrations, and inserts a Tenant row", async () => {
    const tenant = await provisionTenant({ slug: SLUG, schemaName: SCHEMA });

    expect(tenant.slug).toBe(SLUG);
    expect(tenant.schemaName).toBe(SCHEMA);

    const schemaRow = await publicDb.$queryRawUnsafe<{ schema_name: string }[]>(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
      SCHEMA,
    );
    expect(schemaRow).toHaveLength(1);

    const tenantDb = getTenantDb(SCHEMA);
    const clienteCount = await tenantDb.cliente.count();
    expect(clienteCount).toBe(0);
  });

  it("rejects a schema name that is not a safe SQL identifier", async () => {
    await expect(
      provisionTenant({ slug: "bad", schemaName: "not valid; DROP TABLE x;" }),
    ).rejects.toThrow(/Invalid schema name/);
  });
});
