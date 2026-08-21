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

  it("creates one default Sede for the new tenant", async () => {
    await provisionTenant({ slug: SLUG, schemaName: SCHEMA });

    const tenantDb = getTenantDb(SCHEMA);
    const sedes = await tenantDb.sede.findMany();

    expect(sedes).toHaveLength(1);
    expect(sedes[0].nombre).toBe("Sede principal");
  });

  it("creates one default Bodega for the new tenant, tied to the default Sede", async () => {
    await provisionTenant({ slug: SLUG, schemaName: SCHEMA });

    const tenantDb = getTenantDb(SCHEMA);
    const sedes = await tenantDb.sede.findMany();
    const bodegas = await tenantDb.bodega.findMany();

    expect(bodegas).toHaveLength(1);
    expect(bodegas[0].nombre).toBe("Bodega principal");
    expect(bodegas[0].sedeId).toBe(sedes[0].id);
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

  it("cleans up the Tenant row and the schema when sede.create fails after the Tenant row was inserted", async () => {
    const tenantDb = getTenantDb(SCHEMA);
    vi.spyOn(tenantDb.sede, "create").mockRejectedValueOnce(new Error("Simulated Sede failure"));

    await expect(provisionTenant({ slug: SLUG, schemaName: SCHEMA })).rejects.toThrow(
      /Simulated Sede failure/,
    );

    vi.restoreAllMocks();

    const tenantCount = await publicDb.tenant.count({ where: { slug: SLUG } });
    expect(tenantCount).toBe(0);

    const schemaRow = await publicDb.$queryRawUnsafe<{ schema_name: string }[]>(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
      SCHEMA,
    );
    expect(schemaRow).toHaveLength(0);
  });

  it("does NOT drop the schema when a concurrent call already created a Tenant row for schemaName (race safety)", async () => {
    // Simulate the winner of a race: a normal provisionTenant() call that has already
    // created the real schema, run the real migration, and inserted the real Tenant row.
    await provisionTenant({ slug: SLUG, schemaName: SCHEMA });

    // Simulate the loser of the race: a second provisionTenant() call whose own
    // pre-check ran (hypothetically) before the winner's tenant.create() committed, so it
    // proceeds past the pre-check. We reproduce that ordering by making only THIS call's
    // pre-check believe no tenant exists yet (mockResolvedValueOnce), while every other
    // findFirst call (including the one inside the new cleanup guard) sees real DB state.
    // The loser then hits CREATE SCHEMA IF NOT EXISTS (idempotent), re-runs migrate deploy
    // (idempotent, no-op), and finally fails at tenant.create() with a real unique-constraint
    // violation because the winner's row already exists for this slug/schemaName.
    vi.spyOn(publicDb.tenant, "findFirst").mockResolvedValueOnce(null);

    await expect(provisionTenant({ slug: SLUG, schemaName: SCHEMA })).rejects.toThrow();

    vi.restoreAllMocks();

    // The winner's schema must survive: the loser's cleanup must see the real Tenant row
    // (created by the winner) and skip DROP SCHEMA entirely.
    const schemaRow = await publicDb.$queryRawUnsafe<{ schema_name: string }[]>(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
      SCHEMA,
    );
    expect(schemaRow).toHaveLength(1);

    const tenantCount = await publicDb.tenant.count({ where: { schemaName: SCHEMA } });
    expect(tenantCount).toBe(1);
  });

  it("exposes the usuarioSede bridge table on a freshly provisioned tenant", async () => {
    await provisionTenant({ slug: SLUG, schemaName: SCHEMA });

    const tenantDb = getTenantDb(SCHEMA);

    // The table exists and is empty: provisionTenant creates no Usuario rows,
    // so there is nothing to grant yet (seedTenantUser does that -- Task 2).
    await expect(tenantDb.usuarioSede.count()).resolves.toBe(0);
  });
});
