import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

// --- Regression guard for the UsuarioSede backfill in migration
// 20260821173618_add_usuario_sede (see that file's INSERT ... SELECT). This is
// the highest-risk piece of Fase 6: a wrong or missing backfill locks every
// non-ADMIN user out of every already-provisioned tenant once the login sede
// gate ships. The tests above only ever provision FRESH schemas (zero
// pre-existing Usuario rows), so they never exercise the backfill's
// SELECT/ORDER BY/LIMIT/CROSS JOIN logic. This block reproduces "users and
// sedes already existed before this migration ran" and asserts the backfill
// grants the OLDEST Sede, not an arbitrary one.
const TENANT_SCHEMA_DIR = path.join(process.cwd(), "prisma", "tenant");
const USUARIO_SEDE_MIGRATION = "20260821173618_add_usuario_sede";
const BACKFILL_SCHEMA = "test_task6_usuario_sede_backfill";

async function dropBackfillSchema() {
  await publicDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${BACKFILL_SCHEMA}" CASCADE`);
}

function runMigrateDeploy(schemaPrismaPath: string, schemaName: string) {
  const base = process.env.TENANT_DATABASE_BASE_URL;
  if (!base) {
    throw new Error("TENANT_DATABASE_BASE_URL is not set");
  }
  const separator = base.includes("?") ? "&" : "?";
  const tenantUrl = `${base}${separator}schema=${schemaName}`;

  execSync(`npx prisma migrate deploy --schema=${schemaPrismaPath}`, {
    env: { ...process.env, TENANT_DATABASE_URL: tenantUrl },
    stdio: "inherit",
  });
}

/**
 * Builds a throwaway copy of prisma/tenant (schema.prisma + migrations) in a
 * temp dir, holding out one migration folder by name. This lets a test apply
 * "every migration up to but not including X" WITHOUT touching the real,
 * committed migrations/ directory -- other test files run `migrate deploy`
 * against that same real directory concurrently (see vitest.config.ts), so
 * mutating it in place would race them.
 */
function buildHoldoutSchemaDir(holdoutMigration: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tenant-holdout-"));
  fs.copyFileSync(path.join(TENANT_SCHEMA_DIR, "schema.prisma"), path.join(tmpDir, "schema.prisma"));

  const migrationsSrc = path.join(TENANT_SCHEMA_DIR, "migrations");
  const migrationsDest = path.join(tmpDir, "migrations");
  fs.mkdirSync(migrationsDest);

  for (const entry of fs.readdirSync(migrationsSrc)) {
    if (entry === holdoutMigration) continue;
    fs.cpSync(path.join(migrationsSrc, entry), path.join(migrationsDest, entry), { recursive: true });
  }

  return tmpDir;
}

describe("provisionTenant", () => {
  afterEach(dropTestSchema);
  afterEach(dropBackfillSchema);

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

  it("backfills every pre-existing Usuario onto the tenant's OLDEST Sede when the usuario_sede migration runs (regression guard for 20260821173618_add_usuario_sede)", async () => {
    // Two full `prisma migrate deploy` runs (holdout + real schema) against a
    // real Postgres schema, on top of everything else the test does -- give it
    // headroom beyond the file's default 20s testTimeout.
    await publicDb.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${BACKFILL_SCHEMA}"`);

    // 1. Apply every migration EXCEPT the one under test, via a throwaway
    //    schema copy, so Usuario/Sede rows can be inserted BEFORE the backfill
    //    migration ever runs -- reproducing "already-provisioned tenant with
    //    real users" instead of the fresh-schema case the other tests cover.
    const holdoutDir = buildHoldoutSchemaDir(USUARIO_SEDE_MIGRATION);
    try {
      runMigrateDeploy(path.join(holdoutDir, "schema.prisma"), BACKFILL_SCHEMA);
    } finally {
      fs.rmSync(holdoutDir, { recursive: true, force: true });
    }

    const tenantDb = getTenantDb(BACKFILL_SCHEMA);

    // 2. Seed pre-existing Sede and Usuario rows with distinct, known
    //    createdAt timestamps -- mirroring the implementer's manual proof.
    const olderSede = await tenantDb.sede.create({
      data: { nombre: "Sede antigua", createdAt: new Date("2026-01-01T00:00:00.000Z") },
    });
    const newerSede = await tenantDb.sede.create({
      data: { nombre: "Sede nueva", createdAt: new Date("2026-06-01T00:00:00.000Z") },
    });

    const usuarios = await Promise.all(
      ["a", "b", "c"].map((suffix) =>
        tenantDb.usuario.create({
          data: {
            email: `backfill-${suffix}@task6-fixture.test`,
            passwordHash: "hash",
            nombre: `Usuario ${suffix}`,
          },
        }),
      ),
    );

    // 3. Apply the migration under test, using the real committed
    //    schema.prisma (full migrations dir). Prisma's migration history
    //    table -- scoped to BACKFILL_SCHEMA -- means only this still-pending
    //    migration actually runs; its INSERT ... SELECT backfill fires
    //    against the pre-existing rows seeded above.
    runMigrateDeploy(path.join(TENANT_SCHEMA_DIR, "schema.prisma"), BACKFILL_SCHEMA);

    // 4. Every pre-existing Usuario must get exactly one UsuarioSede row,
    //    pointing at the OLDER Sede -- not the newer one, not an arbitrary one.
    const usuarioSedes = await tenantDb.usuarioSede.findMany();
    expect(usuarioSedes).toHaveLength(usuarios.length);

    for (const usuario of usuarios) {
      const grants = usuarioSedes.filter((row) => row.usuarioId === usuario.id);
      expect(grants).toHaveLength(1);
      expect(grants[0].sedeId).toBe(olderSede.id);
      expect(grants[0].sedeId).not.toBe(newerSede.id);
    }
  }, 60000);
});
