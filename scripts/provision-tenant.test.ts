import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("rejects a reserved slug without creating any schema", async () => {
    const RESERVED_SLUG = "www";
    const RESERVED_SCHEMA = "test_task6_www_fixture";

    await expect(
      provisionTenant({ slug: RESERVED_SLUG, schemaName: RESERVED_SCHEMA }),
    ).rejects.toThrow(/Invalid slug/);

    const schemaRow = await publicDb.$queryRawUnsafe<{ schema_name: string }[]>(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
      RESERVED_SCHEMA,
    );
    expect(schemaRow).toHaveLength(0);
  });

  it("rejects provisioning when a Tenant row already exists for the slug or schemaName, without touching the schema", async () => {
    await provisionTenant({ slug: SLUG, schemaName: SCHEMA });

    await expect(provisionTenant({ slug: SLUG, schemaName: "test_task6_other_schema" })).rejects.toThrow(
      /already exists/i,
    );

    const otherSchemaRow = await publicDb.$queryRawUnsafe<{ schema_name: string }[]>(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
      "test_task6_other_schema",
    );
    expect(otherSchemaRow).toHaveLength(0);
  });

  it("cleans up the schema when tenant.create fails after the schema was created and migrated", async () => {
    vi.spyOn(publicDb.tenant, "create").mockRejectedValueOnce(new Error("Simulated failure"));

    await expect(provisionTenant({ slug: SLUG, schemaName: SCHEMA })).rejects.toThrow(
      /Simulated failure/,
    );

    vi.restoreAllMocks();

    const schemaRow = await publicDb.$queryRawUnsafe<{ schema_name: string }[]>(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
      SCHEMA,
    );
    expect(schemaRow).toHaveLength(0);
  });
});
