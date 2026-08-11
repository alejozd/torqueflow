# TorqueFlow — Fase 1 (Núcleo): Implementation Plan (Tasks 3-17)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Continuation notice

This file replaces a plan lost in a data-loss incident on 2026-08-09 (an implementer subagent deleted the plan file, `.git` history, and the design doc while working around an npm package-naming issue; `.git` history and the design doc were since recovered from other means, the plan file was not — hence this regeneration). **Tasks 1 and 2 are already implemented and verified against the live repository — do not re-plan or redo them:**

- **Task 1 (git init):** done. Repo on branch `main`, pushed to `https://github.com/alejozd/torqueflow.git`, commit `4715f2e` (`.gitignore`, `README.md`, `docs/`).
- **Task 2 (Next.js scaffold):** done. Commit `9f7433e`, pushed. Verified on disk 2026-08-09: `create-next-app` scaffold with Next.js `16.3.0`, React `19.2.8`, TypeScript strict (`tsconfig.json` has `"strict": true`, `"paths": { "@/*": ["./src/*"] }`), ESLint flat config (`eslint.config.mjs`), Tailwind v4 (`@tailwindcss/postcss`), `src/` directory layout, `src/app/page.tsx` has a minimal Spanish-language TorqueFlow landing stub, `src/app/layout.tsx` is the default `create-next-app` root layout. `package.json` scripts are only `dev`/`build`/`start`/`lint` — no test scripts yet (added in Task 3).

This plan picks up at **Task 3** and covers the rest of Phase 1: the testing stack, multi-tenant data layer, tenant resolution, auth, and the first end-to-end business module (Clientes y vehículos, including Historial de vehículo). Task numbering intentionally starts at 3 and is not renumbered, to stay consistent with any references to the original 17-task plan (design doc: `docs/design/2026-08-02-taller-saas-multitenant-design.md`).

## Global Constraints

These apply to every task below; each task's steps implicitly inherit them.

- No local Postgres. All Prisma commands connect to the developer's remote Ubuntu Postgres server over LAN — every `DATABASE_URL`/`TENANT_DATABASE_URL`/`TENANT_DATABASE_BASE_URL` value in this plan uses the placeholder host `postgres.internal`; the reader substitutes their real host/credentials before running any command that touches the database.
- Single Postgres database `torqueflow`. The `public` schema holds global tables (`Tenant`). One Postgres schema per tenant, all sharing the same table set defined in `prisma/tenant/schema.prisma`.
- Tenant resolution is by **first-level subdomain only** (`taller-perez.zdevs.uk`, never `taller-perez.torqueflow.zdevs.uk`) — a Cloudflare Universal SSL free-tier constraint (design doc §4.1).
- Node.js >= 20.6. npm is the package manager (not pnpm/yarn) — every install command in this plan uses `npm install`.
- **Strict TDD**: every implementation step in this plan is preceded by a real failing-test step, and a step that runs it and confirms the failure, before the implementation step. No implementation code is written before its test exists and has been observed to fail for the right reason.
- **Post-incident safety constraint**: no task's steps may ever instruct deleting or reinitializing `.git`, or deleting `docs/`, as a workaround for an unrelated problem (e.g. a tool/package naming restriction, a "directory not empty" prompt). Anywhere the straightforward approach would tempt that shortcut, this plan instead uses an isolated scratch location (e.g. a temp directory outside the repo) and copies back only the specific files the task is supposed to produce — the same safe pattern used to redo Task 2 after the incident.
- **Prisma major version pin**: `npm install prisma`/`@prisma/client` with no version pin resolves to Prisma 7, which requires the whole project to switch to ESM (`"type": "module"` in `package.json`, Node >=20.19) and replaces the classic `datasource { url = env(...) }` + implicit `new PrismaClient()` pattern with a `prisma.config.ts` + driver-adapter (`@prisma/adapter-pg`) pattern. This plan's `schema.prisma` and client-singleton code (Tasks 4, 5, and any later task that touches `publicDb`/a tenant client) use the classic Prisma 6 syntax and are written against it deliberately — evaluated and explicitly declined by the user 2026-08-10 due to the added ESM/Next.js friction risk for an unrelated benefit. Every `npm install`/`npm install --save-dev` command targeting `prisma` or `@prisma/client` in this plan must pin to `6.19.3` (e.g. `npm install --save-dev prisma@6.19.3` / `npm install @prisma/client@6.19.3`), not the unpinned form literally written in some step blocks below.

---

### Task 3: Testing stack — Vitest + React Testing Library + Playwright

**Why this stack (2026 default for Next.js App Router):** Vitest is Vite-native, shares config/transform pipeline with Next.js's own use of SWC/Vite-family tooling, and starts in milliseconds versus Jest's CommonJS transform overhead — it's the community-recommended unit/component runner for App Router projects. React Testing Library stays the standard for component behavior tests (queries by role/text, not implementation detail). Playwright covers real-browser e2e (multi-tab, network interception, auto-waiting) and is what the later multi-tenant login-through-historial smoke test (Task 17) needs, since that flow spans real HTTP requests through middleware.

**Files:**
- Modify: `package.json` (add devDependencies, `test`/`test:watch`/`test:e2e` scripts)
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `playwright.config.ts`
- Create: `src/app/page.test.tsx`
- Create: `e2e/landing.spec.ts`

**Interfaces:**
- Consumes: `src/app/page.tsx` (`Home` default export, already exists from Task 2).
- Produces: the `npm test` / `npm run test:watch` / `npm run test:e2e` commands and the `vitest.setup.ts` global setup (imported implicitly by every later Vitest run — later tasks' tests rely on `@testing-library/jest-dom` matchers being registered here). Later tasks also rely on the `@/*` alias being resolvable inside Vitest (configured here).

- [ ] **Step 1: Install the testing dependencies**

```bash
npm install --save-dev vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test dotenv
```

- [ ] **Step 2: Write the failing smoke test for the harness**

Create `src/app/page.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "./page";

describe("Home", () => {
  it("renders the TorqueFlow landing heading", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: "TorqueFlow" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it to confirm it fails (no runner configured yet)**

Run: `npx vitest run src/app/page.test.tsx`
Expected: FAIL — `vitest` has no config yet, or the run errors because `@testing-library/jest-dom` matchers (`toBeInTheDocument`) are not registered. Either failure mode confirms there is no working harness yet.

- [ ] **Step 4: Add Vitest config, setup file, and npm scripts**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

Create `vitest.setup.ts`:

```ts
import "dotenv/config";
import "@testing-library/jest-dom/vitest";
```

Edit `package.json` — add to `"scripts"`:

```json
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
```

- [ ] **Step 5: Run it again to confirm it passes**

Run: `npx vitest run src/app/page.test.tsx`
Expected: PASS — 1 test passed.

- [ ] **Step 6: Set up Playwright and its own smoke test**

Run: `npx playwright install --with-deps chromium`

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    env: {
      BASE_DOMAIN: "localhost",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

Create `e2e/landing.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("landing page renders the TorqueFlow heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "TorqueFlow" })).toBeVisible();
});
```

- [ ] **Step 7: Run the Playwright smoke test to confirm it passes**

Run: `npm run test:e2e -- e2e/landing.spec.ts`
Expected: PASS — 1 test passed (Playwright starts `next dev` via `webServer` automatically).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts vitest.setup.ts playwright.config.ts src/app/page.test.tsx e2e/landing.spec.ts
git commit -m "test: add Vitest/RTL/Playwright testing stack with smoke tests"
```

---

### Task 4: Prisma — `public` schema with the `Tenant` table

**Files:**
- Create: `prisma/schema.prisma`
- Create: `.env.example`
- Modify: `.gitignore` (ignore generated Prisma client output and `.env`, the latter is already present)
- Create: `src/lib/db/public-client.ts`
- Test: `src/lib/db/public-client.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (first data-layer task).
- Produces: `publicDb` (a `PrismaClient` singleton typed against `@/generated/prisma-public`), and the `Tenant` model (`id`, `slug`, `schemaName`, `createdAt`, `updatedAt`). Task 6 (provisioning), Task 8 (`resolveTenant`), and Task 9 (auth) all import `publicDb` from `src/lib/db/public-client.ts` and read/write `Tenant` rows by `slug`/`schemaName`.

- [ ] **Step 1: Install Prisma**

```bash
npm install --save-dev prisma
npm install @prisma/client
```

- [ ] **Step 2: Add environment placeholders**

Create `.env.example`:

```bash
# Public schema (global tables: Tenant). Copy to .env and substitute your
# real remote Postgres host/credentials — never commit .env.
DATABASE_URL="postgresql://torqueflow:changeme@postgres.internal:5432/torqueflow?schema=public"

# Base connection string for tenant schemas (no ?schema= — appended at
# runtime per tenant by src/lib/db/tenant-client.ts). Used directly (with a
# reference schema appended) when authoring/replaying tenant migrations.
TENANT_DATABASE_BASE_URL="postgresql://torqueflow:changeme@postgres.internal:5432/torqueflow"
TENANT_DATABASE_URL="postgresql://torqueflow:changeme@postgres.internal:5432/torqueflow?schema=taller_dev_reference"

AUTH_SECRET="replace-with-openssl-rand-base64-32"
BASE_DOMAIN="zdevs.uk"
```

Run: `cp .env.example .env` (then edit `.env` with real credentials before running any step that touches the database — `.env` is already gitignored).

- [ ] **Step 3: Write the failing test**

Create `src/lib/db/public-client.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { publicDb } from "./public-client";

describe("publicDb (Tenant model, public schema)", () => {
  afterEach(async () => {
    await publicDb.tenant.deleteMany({ where: { slug: "test-task4-fixture" } });
  });

  it("creates and reads back a Tenant row", async () => {
    const created = await publicDb.tenant.create({
      data: { slug: "test-task4-fixture", schemaName: "test_task4_fixture" },
    });

    const found = await publicDb.tenant.findUnique({ where: { slug: "test-task4-fixture" } });

    expect(found?.id).toBe(created.id);
    expect(found?.schemaName).toBe("test_task4_fixture");
  });
});
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `npx vitest run src/lib/db/public-client.test.ts`
Expected: FAIL — `Cannot find module './public-client'` (neither the module nor the generated Prisma client exist yet).

- [ ] **Step 5: Write the Prisma public schema**

Create `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma-public"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Tenant {
  id         String   @id @default(cuid())
  slug       String   @unique
  schemaName String   @unique @map("schema_name")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  @@map("tenants")
}
```

- [ ] **Step 6: Run the migration and generate the client against the real remote Postgres**

Run: `npx prisma migrate dev --schema=prisma/schema.prisma --name init_tenant`
Expected: prompts to create the `torqueflow` database if missing, then creates `prisma/migrations/<timestamp>_init_tenant/`, applies it, and runs `prisma generate` automatically — output ends with `Your database is now in sync with your schema.` (Requires `DATABASE_URL` in `.env` to point at a reachable Postgres server — substitute your real `postgres.internal` host/credentials first.)

- [ ] **Step 7: Write the public Prisma client singleton**

Create `src/lib/db/public-client.ts`:

```ts
import { PrismaClient } from "@/generated/prisma-public";

declare global {
  // eslint-disable-next-line no-var
  var __torqueflowPublicPrisma: PrismaClient | undefined;
}

export const publicDb: PrismaClient =
  globalThis.__torqueflowPublicPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__torqueflowPublicPrisma = publicDb;
}
```

- [ ] **Step 8: Run the test again to confirm it passes**

Run: `npx vitest run src/lib/db/public-client.test.ts`
Expected: PASS — 1 test passed.

- [ ] **Step 9: Ignore the generated client output**

Edit `.gitignore` — add under the `# Prisma` section:

```
src/generated/
```

- [ ] **Step 10: Commit**

```bash
git add prisma/schema.prisma prisma/migrations .env.example .gitignore src/lib/db/public-client.ts src/lib/db/public-client.test.ts package.json package-lock.json
git commit -m "feat: add Prisma public schema with Tenant model"
```

---

### Task 5: Prisma — tenant schema template (`Usuario`, `Cliente`, `Vehiculo`, `HistorialVehiculo`)

**Files:**
- Create: `prisma/tenant/schema.prisma`
- Create: `src/lib/db/tenant-client.ts`
- Test: `src/lib/db/tenant-client.test.ts`

**Interfaces:**
- Consumes: `TENANT_DATABASE_URL` (authoring-time env var, Step 5) and `TENANT_DATABASE_BASE_URL` (runtime env var, from `.env.example` in Task 4).
- Produces: `getTenantDb(schemaName: string): TenantPrismaClient` — every task from here on that touches tenant data (Task 6 provisioning/seeding, Task 8 `resolveTenant` consumers, Task 9 auth, Tasks 12/14/16 server actions) calls this to get a client scoped to one tenant's Postgres schema. Also produces the `Usuario`/`Cliente`/`Vehiculo`/`HistorialVehiculo` models and the `Role` enum (`ADMIN` | `TECNICO` | `RECEPCION`) that Task 9 (auth roles) and all CRUD tasks depend on.

- [ ] **Step 1: Write the tenant schema template**

Create `prisma/tenant/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../src/generated/prisma-tenant"
}

datasource db {
  provider = "postgresql"
  url      = env("TENANT_DATABASE_URL")
}

enum Role {
  ADMIN
  TECNICO
  RECEPCION
}

model Usuario {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String   @map("password_hash")
  nombre       String
  role         Role     @default(RECEPCION)
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@map("usuarios")
}

model Cliente {
  id        String     @id @default(cuid())
  nombre    String
  telefono  String?
  email     String?
  documento String?
  vehiculos Vehiculo[]
  createdAt DateTime   @default(now()) @map("created_at")
  updatedAt DateTime   @updatedAt @map("updated_at")

  @@map("clientes")
}

model Vehiculo {
  id        String              @id @default(cuid())
  placa     String              @unique
  marca     String
  modelo    String
  anio      Int?
  clienteId String              @map("cliente_id")
  cliente   Cliente             @relation(fields: [clienteId], references: [id], onDelete: Restrict)
  historial HistorialVehiculo[]
  createdAt DateTime            @default(now()) @map("created_at")
  updatedAt DateTime            @updatedAt @map("updated_at")

  @@map("vehiculos")
  @@index([clienteId])
}

model HistorialVehiculo {
  id          String   @id @default(cuid())
  vehiculoId  String   @map("vehiculo_id")
  vehiculo    Vehiculo @relation(fields: [vehiculoId], references: [id], onDelete: Cascade)
  descripcion String
  fecha       DateTime @default(now())
  autorId     String?  @map("autor_id")
  createdAt   DateTime @default(now()) @map("created_at")

  @@map("historial_vehiculo")
  @@index([vehiculoId])
}
```

Note: this file is a **template**, not a schema tied to one fixed Postgres schema. It is replayed against a different Postgres schema per tenant (via `?schema=<name>` in the connection string) by the provisioning script in Task 6, using the migration files generated in Step 2 below. `TENANT_DATABASE_URL` (singular, with a fixed reference schema name) is only used at authoring time, to generate migrations; `TENANT_DATABASE_BASE_URL` (no schema) is used at runtime by `getTenantDb`.

- [ ] **Step 2: Generate the initial tenant migration against a reference schema**

Run: `npx prisma migrate dev --schema=prisma/tenant/schema.prisma --name init_tenant_tables`
Expected: creates the `taller_dev_reference` Postgres schema (from `TENANT_DATABASE_URL` in `.env`, set in Task 4 Step 2) if missing, writes `prisma/tenant/migrations/<timestamp>_init_tenant_tables/`, applies it, runs `prisma generate`. (Requires `TENANT_DATABASE_URL` in `.env` pointing at your real reachable Postgres server.)

- [ ] **Step 3: Write the failing test for the tenant client factory**

Create `src/lib/db/tenant-client.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { getTenantDb } from "./tenant-client";

const TEST_SCHEMA = "test_task5_fixture";

describe("getTenantDb", () => {
  afterEach(async () => {
    const tenantDb = getTenantDb(TEST_SCHEMA);
    await tenantDb.vehiculo.deleteMany({ where: { placa: "TEST-001" } });
    await tenantDb.cliente.deleteMany({ where: { nombre: "Cliente Fixture Task5" } });
  });

  it("returns a client that reads/writes the tenant schema, with Cliente-Vehiculo relations working", async () => {
    const tenantDb = getTenantDb(TEST_SCHEMA);

    const cliente = await tenantDb.cliente.create({
      data: { nombre: "Cliente Fixture Task5" },
    });

    const vehiculo = await tenantDb.vehiculo.create({
      data: { placa: "TEST-001", marca: "Toyota", modelo: "Corolla", clienteId: cliente.id },
    });

    const found = await tenantDb.cliente.findUnique({
      where: { id: cliente.id },
      include: { vehiculos: true },
    });

    expect(found?.vehiculos).toHaveLength(1);
    expect(found?.vehiculos[0].id).toBe(vehiculo.id);
  });

  it("caches and returns the same client instance for the same schema name", () => {
    expect(getTenantDb(TEST_SCHEMA)).toBe(getTenantDb(TEST_SCHEMA));
  });
});
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `npx vitest run src/lib/db/tenant-client.test.ts`
Expected: FAIL — `Cannot find module './tenant-client'`.

- [ ] **Step 5: Ensure the test schema exists**

The test above assumes `test_task5_fixture` already exists as a Postgres schema with the tenant tables (provisioning a schema on demand is Task 6's job, not this one — Task 5 only builds the client factory). Run manually once against your real server:

```bash
psql "$DATABASE_URL_WITHOUT_SCHEMA_PARAM" -c 'CREATE SCHEMA IF NOT EXISTS test_task5_fixture;'
TENANT_DATABASE_URL="postgresql://torqueflow:changeme@postgres.internal:5432/torqueflow?schema=test_task5_fixture" \
  npx prisma migrate deploy --schema=prisma/tenant/schema.prisma
```

(Substitute your real host/credentials. This mirrors exactly what Task 6's `provisionTenant` automates — doing it manually here keeps Task 5 scoped to the client factory only.)

- [ ] **Step 6: Write the tenant client factory**

Create `src/lib/db/tenant-client.ts`:

```ts
import { PrismaClient as TenantPrismaClient } from "@/generated/prisma-tenant";

export type { TenantPrismaClient };

function buildTenantConnectionString(schemaName: string): string {
  const base = process.env.TENANT_DATABASE_BASE_URL;
  if (!base) {
    throw new Error("TENANT_DATABASE_BASE_URL is not set");
  }
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}schema=${encodeURIComponent(schemaName)}`;
}

const tenantClientCache = new Map<string, TenantPrismaClient>();

export function getTenantDb(schemaName: string): TenantPrismaClient {
  const cached = tenantClientCache.get(schemaName);
  if (cached) return cached;

  const client = new TenantPrismaClient({
    datasourceUrl: buildTenantConnectionString(schemaName),
  });
  tenantClientCache.set(schemaName, client);
  return client;
}
```

- [ ] **Step 7: Run the tests again to confirm they pass**

Run: `npx vitest run src/lib/db/tenant-client.test.ts`
Expected: PASS — 2 tests passed.

- [ ] **Step 8: Commit**

```bash
git add prisma/tenant/schema.prisma prisma/tenant/migrations src/lib/db/tenant-client.ts src/lib/db/tenant-client.test.ts
git commit -m "feat: add tenant Prisma schema template and per-tenant client factory"
```

---

### Task 6: Tenant provisioning and user-seeding scripts

**Files:**
- Create: `scripts/provision-tenant.ts`
- Create: `scripts/seed-tenant-user.ts`
- Create: `scripts/cli/provision-tenant.ts`
- Create: `scripts/cli/seed-tenant-user.ts`
- Test: `scripts/provision-tenant.test.ts`
- Test: `scripts/seed-tenant-user.test.ts`
- Modify: `package.json` (add `tenant:provision` / `tenant:seed-user` scripts)

**Interfaces:**
- Consumes: `publicDb` (Task 4), `getTenantDb` (Task 5), the `Tenant` model, the `Usuario` model and `Role` enum.
- Produces: `provisionTenant(input: { slug: string; schemaName: string }): Promise<Tenant>` and `seedTenantUser(input: { schemaName: string; email: string; password: string; nombre: string; role?: Role }): Promise<Usuario>`. Task 17 (e2e smoke test) calls both directly (as library functions, not via the CLI) in its Playwright global setup to provision the test tenant before the browser flow runs.

- [ ] **Step 1: Install bcryptjs and tsx**

```bash
npm install bcryptjs
npm install --save-dev @types/bcryptjs tsx
```

`bcryptjs` (pure JS) is used instead of native `bcrypt` specifically to avoid requiring a native build toolchain (node-gyp/Visual Studio Build Tools) on Windows dev machines — password hashing here always runs in the Node runtime (never Edge), so the pure-JS performance cost is acceptable at this scale. `tsx` runs the CLI wrapper scripts directly and resolves the `@/*` path alias from `tsconfig.json` automatically (no separate `tsconfig-paths` setup needed).

- [ ] **Step 2: Write the failing test for `provisionTenant`**

Create `scripts/provision-tenant.test.ts`:

```ts
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
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run scripts/provision-tenant.test.ts`
Expected: FAIL — `Cannot find module './provision-tenant'`.

- [ ] **Step 4: Write `provisionTenant`**

Create `scripts/provision-tenant.ts`:

```ts
import { execSync } from "node:child_process";
import { publicDb } from "@/lib/db/public-client";
import type { Tenant } from "@/generated/prisma-public";

export interface ProvisionTenantInput {
  slug: string;
  schemaName: string;
}

const SAFE_IDENTIFIER = /^[a-z][a-z0-9_]*$/;

export async function provisionTenant({ slug, schemaName }: ProvisionTenantInput): Promise<Tenant> {
  if (!SAFE_IDENTIFIER.test(schemaName)) {
    throw new Error(`Invalid schema name: "${schemaName}" (expected lowercase snake_case)`);
  }

  await publicDb.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

  const base = process.env.TENANT_DATABASE_BASE_URL;
  if (!base) {
    throw new Error("TENANT_DATABASE_BASE_URL is not set");
  }
  const separator = base.includes("?") ? "&" : "?";
  const tenantUrl = `${base}${separator}schema=${schemaName}`;

  execSync("npx prisma migrate deploy --schema=prisma/tenant/schema.prisma", {
    env: { ...process.env, TENANT_DATABASE_URL: tenantUrl },
    stdio: "inherit",
  });

  return publicDb.tenant.create({ data: { slug, schemaName } });
}
```

- [ ] **Step 5: Run the test again to confirm it passes**

Run: `npx vitest run scripts/provision-tenant.test.ts`
Expected: PASS — 2 tests passed.

- [ ] **Step 6: Write the failing test for `seedTenantUser`**

Create `scripts/seed-tenant-user.test.ts`:

```ts
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
```

- [ ] **Step 7: Run it to confirm it fails**

Run: `npx vitest run scripts/seed-tenant-user.test.ts`
Expected: FAIL — `Cannot find module './seed-tenant-user'`.

- [ ] **Step 8: Write `seedTenantUser`**

Create `scripts/seed-tenant-user.ts`:

```ts
import bcrypt from "bcryptjs";
import { getTenantDb } from "@/lib/db/tenant-client";
import type { Usuario, Role } from "@/generated/prisma-tenant";

export interface SeedTenantUserInput {
  schemaName: string;
  email: string;
  password: string;
  nombre: string;
  role?: Role;
}

export async function seedTenantUser({
  schemaName,
  email,
  password,
  nombre,
  role = "ADMIN",
}: SeedTenantUserInput): Promise<Usuario> {
  const tenantDb = getTenantDb(schemaName);
  const passwordHash = await bcrypt.hash(password, 12);

  return tenantDb.usuario.upsert({
    where: { email },
    update: { passwordHash, nombre, role },
    create: { email, passwordHash, nombre, role },
  });
}
```

- [ ] **Step 9: Run the test again to confirm it passes**

Run: `npx vitest run scripts/seed-tenant-user.test.ts`
Expected: PASS — 1 test passed.

- [ ] **Step 10: Add CLI wrappers and npm scripts**

Create `scripts/cli/provision-tenant.ts`:

```ts
import "dotenv/config";
import { provisionTenant } from "../provision-tenant";

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: npm run tenant:provision -- <slug>");
  process.exit(1);
}
const schemaName = slug.replace(/-/g, "_");

provisionTenant({ slug, schemaName })
  .then((tenant) => {
    console.log(`Provisioned tenant "${tenant.slug}" -> schema "${tenant.schemaName}"`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

Create `scripts/cli/seed-tenant-user.ts`:

```ts
import "dotenv/config";
import { seedTenantUser } from "../seed-tenant-user";

const [schemaName, email, password, nombre, role] = process.argv.slice(2);
if (!schemaName || !email || !password || !nombre) {
  console.error("Usage: npm run tenant:seed-user -- <schemaName> <email> <password> <nombre> [role]");
  process.exit(1);
}

seedTenantUser({
  schemaName,
  email,
  password,
  nombre,
  role: role as "ADMIN" | "TECNICO" | "RECEPCION" | undefined,
})
  .then((usuario) => {
    console.log(`Seeded user "${usuario.email}" (${usuario.role}) in schema "${schemaName}"`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

Edit `package.json` — add to `"scripts"`:

```json
    "tenant:provision": "tsx scripts/cli/provision-tenant.ts",
    "tenant:seed-user": "tsx scripts/cli/seed-tenant-user.ts"
```

- [ ] **Step 11: Manually verify the CLI end to end**

Run: `npm run tenant:provision -- taller-manual-check`
Expected: `Provisioned tenant "taller-manual-check" -> schema "taller_manual_check"`

Run: `npm run tenant:seed-user -- taller_manual_check admin@manual-check.test Sup3rSecret Admin`
Expected: `Seeded user "admin@manual-check.test" (ADMIN) in schema "taller_manual_check"`

Clean up manually: `psql "$DATABASE_URL" -c 'DROP SCHEMA IF EXISTS taller_manual_check CASCADE;'` and delete the corresponding row from `public.tenants`.

- [ ] **Step 12: Commit**

```bash
git add scripts/provision-tenant.ts scripts/seed-tenant-user.ts scripts/cli scripts/provision-tenant.test.ts scripts/seed-tenant-user.test.ts package.json package-lock.json
git commit -m "feat: add tenant provisioning and user-seeding scripts"
```

---

### Task 7: Subdomain extraction (pure, Edge-safe)

**Files:**
- Create: `src/lib/tenant/subdomain.ts`
- Test: `src/lib/tenant/subdomain.test.ts`

**Interfaces:**
- Consumes: nothing (pure function, no I/O, no Node/Edge-specific APIs — safe to import from both `middleware.ts` (Edge runtime) and any Node-runtime module).
- Produces: `extractTenantSlug(hostHeader: string | null | undefined, baseDomain: string): string | null`. Task 8's `middleware.ts` is the sole caller.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/tenant/subdomain.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractTenantSlug } from "./subdomain";

describe("extractTenantSlug", () => {
  it("extracts the first-level subdomain as the tenant slug", () => {
    expect(extractTenantSlug("taller-perez.zdevs.uk", "zdevs.uk")).toBe("taller-perez");
  });

  it("returns null for the bare apex domain (no tenant)", () => {
    expect(extractTenantSlug("zdevs.uk", "zdevs.uk")).toBeNull();
  });

  it("returns null for a second-level nested subdomain (unsupported by design)", () => {
    expect(extractTenantSlug("taller-perez.torqueflow.zdevs.uk", "zdevs.uk")).toBeNull();
  });

  it("returns null for a reserved subdomain like www", () => {
    expect(extractTenantSlug("www.zdevs.uk", "zdevs.uk")).toBeNull();
  });

  it("strips the port before matching", () => {
    expect(extractTenantSlug("taller-perez.zdevs.uk:3000", "zdevs.uk")).toBe("taller-perez");
  });

  it("returns null for a host on a completely different domain", () => {
    expect(extractTenantSlug("evil.com", "zdevs.uk")).toBeNull();
  });

  it("returns null for a missing host header", () => {
    expect(extractTenantSlug(null, "zdevs.uk")).toBeNull();
    expect(extractTenantSlug(undefined, "zdevs.uk")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(extractTenantSlug("Taller-Perez.ZDEVS.UK", "zdevs.uk")).toBe("taller-perez");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/tenant/subdomain.test.ts`
Expected: FAIL — `Cannot find module './subdomain'`.

- [ ] **Step 3: Implement `extractTenantSlug`**

Create `src/lib/tenant/subdomain.ts`:

```ts
const RESERVED_SUBDOMAINS = new Set(["www", "app", "api", "admin"]);

/**
 * Pure, Edge-runtime-safe extraction of a tenant slug from a Host header.
 * Only a *first-level* subdomain of baseDomain resolves to a tenant, per
 * design doc §4.1 (Cloudflare Universal SSL free-tier only covers *.baseDomain,
 * not *.sub.baseDomain) — anything more deeply nested is rejected, not
 * collapsed to its first label, so a misconfigured deep subdomain fails
 * closed instead of silently resolving to the wrong tenant.
 */
export function extractTenantSlug(
  hostHeader: string | null | undefined,
  baseDomain: string,
): string | null {
  if (!hostHeader) return null;

  const host = hostHeader.split(":")[0].toLowerCase();
  const base = baseDomain.toLowerCase();

  if (host === base) return null;
  if (!host.endsWith(`.${base}`)) return null;

  const prefix = host.slice(0, host.length - base.length - 1);
  if (prefix.length === 0 || prefix.includes(".")) return null;
  if (RESERVED_SUBDOMAINS.has(prefix)) return null;

  return prefix;
}
```

- [ ] **Step 4: Run the tests again to confirm they pass**

Run: `npx vitest run src/lib/tenant/subdomain.test.ts`
Expected: PASS — 8 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tenant/subdomain.ts src/lib/tenant/subdomain.test.ts
git commit -m "feat: add pure Edge-safe subdomain-to-tenant-slug extraction"
```

---

### Task 8: Tenant resolution — the Edge/Node split

**Design note (read first):** Next.js Middleware always runs in the Edge runtime, which cannot open a raw TCP Postgres connection — Prisma's query engine needs Node APIs (`net`, native binaries/WASM engine startup) that the Edge runtime doesn't provide. A naive reading of the design doc §4 ("the app resolves the tenant by subdomain... and selects the connection/schema") could suggest doing the full resolution — including the `public.Tenant` lookup — inside `middleware.ts`. That does not work. This task deliberately splits tenant resolution into two layers:

1. **Edge layer — `middleware.ts`**: runs on every request, does only the pure Host-header parsing from Task 7 (`extractTenantSlug`), and tags the request with the result via a header (`x-tenant-slug`). No database access, no Prisma import, nothing that requires Node APIs.
2. **Node layer — `resolveTenant()`**: a plain async function, called from Server Components (layouts), Server Actions, and NextAuth's `authorize()` (Task 9) — all of which run in the Node runtime by default in this project (no route or layout in this plan sets `export const runtime = "edge"`). It reads the `x-tenant-slug` header set by the middleware (via `next/headers`) and performs the actual `publicDb.tenant.findUnique(...)` lookup, returning the tenant's schema name.

This file is committed as a persistent design note, since it's a real deviation from a naive single-layer reading of the design doc and future contributors need to know not to "simplify" it back into one layer.

**Files:**
- Create: `src/lib/tenant/constants.ts`
- Create: `src/middleware.ts`
- Create: `src/lib/tenant/resolve-tenant.ts`
- Test: `src/lib/tenant/resolve-tenant.test.ts`
- Create: `docs/design/notes/2026-08-09-tenant-resolution-edge-split.md`

**Interfaces:**
- Consumes: `extractTenantSlug` (Task 7), `publicDb` (Task 4).
- Produces: `TENANT_SLUG_HEADER` (string constant `"x-tenant-slug"`) and `resolveTenant(): Promise<{ slug: string; schemaName: string } | null>`. Task 9 (`authorize()`), Tasks 12/14/16 (server actions), and the dashboard layout in Task 12 all call `resolveTenant()`.

- [ ] **Step 1: Write the shared header-name constant**

Create `src/lib/tenant/constants.ts`:

```ts
export const TENANT_SLUG_HEADER = "x-tenant-slug";
```

(This lives in its own file, separate from `middleware.ts`, so that Node-runtime modules like `resolve-tenant.ts` never import anything from `middleware.ts` itself — keeping the Edge and Node layers fully decoupled at the module level, not just conceptually.)

- [ ] **Step 2: Write the failing test for `resolveTenant`**

Create `src/lib/tenant/resolve-tenant.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockHeaders = vi.fn();
vi.mock("next/headers", () => ({ headers: () => mockHeaders() }));

const mockFindUnique = vi.fn();
vi.mock("@/lib/db/public-client", () => ({
  publicDb: { tenant: { findUnique: (...args: unknown[]) => mockFindUnique(...args) } },
}));

import { resolveTenant } from "./resolve-tenant";
import { TENANT_SLUG_HEADER } from "./constants";

describe("resolveTenant", () => {
  beforeEach(() => {
    mockHeaders.mockReset();
    mockFindUnique.mockReset();
  });

  it("returns null when the middleware did not tag the request with a slug", async () => {
    mockHeaders.mockReturnValue(new Headers());

    const result = await resolveTenant();

    expect(result).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns null when the slug does not match any Tenant row", async () => {
    const h = new Headers();
    h.set(TENANT_SLUG_HEADER, "no-such-tenant");
    mockHeaders.mockReturnValue(h);
    mockFindUnique.mockResolvedValue(null);

    const result = await resolveTenant();

    expect(result).toBeNull();
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { slug: "no-such-tenant" } });
  });

  it("returns the slug and schemaName when the Tenant row exists", async () => {
    const h = new Headers();
    h.set(TENANT_SLUG_HEADER, "taller-perez");
    mockHeaders.mockReturnValue(h);
    mockFindUnique.mockResolvedValue({
      id: "1",
      slug: "taller-perez",
      schemaName: "taller_perez",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await resolveTenant();

    expect(result).toEqual({ slug: "taller-perez", schemaName: "taller_perez" });
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run src/lib/tenant/resolve-tenant.test.ts`
Expected: FAIL — `Cannot find module './resolve-tenant'`.

- [ ] **Step 4: Implement `resolveTenant`**

Create `src/lib/tenant/resolve-tenant.ts`:

```ts
import { headers } from "next/headers";
import { publicDb } from "@/lib/db/public-client";
import { TENANT_SLUG_HEADER } from "./constants";

export interface ResolvedTenant {
  slug: string;
  schemaName: string;
}

/**
 * Node-runtime only. Reads the tenant slug tagged onto the request by
 * middleware.ts (Edge runtime) and resolves it against the public.Tenant
 * table. See docs/design/notes/2026-08-09-tenant-resolution-edge-split.md.
 */
export async function resolveTenant(): Promise<ResolvedTenant | null> {
  const headerList = await headers();
  const slug = headerList.get(TENANT_SLUG_HEADER);
  if (!slug) return null;

  const tenant = await publicDb.tenant.findUnique({ where: { slug } });
  if (!tenant) return null;

  return { slug: tenant.slug, schemaName: tenant.schemaName };
}
```

- [ ] **Step 5: Run the tests again to confirm they pass**

Run: `npx vitest run src/lib/tenant/resolve-tenant.test.ts`
Expected: PASS — 3 tests passed.

- [ ] **Step 6: Write the middleware (Edge layer)**

Create `src/middleware.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { extractTenantSlug } from "@/lib/tenant/subdomain";
import { TENANT_SLUG_HEADER } from "@/lib/tenant/constants";

const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "zdevs.uk";

export function middleware(request: NextRequest) {
  const slug = extractTenantSlug(request.headers.get("host"), BASE_DOMAIN);

  const requestHeaders = new Headers(request.headers);
  if (slug) {
    requestHeaders.set(TENANT_SLUG_HEADER, slug);
  } else {
    requestHeaders.delete(TENANT_SLUG_HEADER);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

Middleware has no test file: it is a thin adapter (extract header, call the already-tested pure function, set another header) with no independently meaningful branch left to unit test in isolation from the Next.js request/response machinery — its behavior is exercised end-to-end by the Playwright smoke test in Task 17, and its only real logic (`extractTenantSlug`) is fully covered by Task 7's tests.

- [ ] **Step 7: Write the design note**

Create `docs/design/notes/2026-08-09-tenant-resolution-edge-split.md`:

```markdown
# Design note: tenant resolution splits across Edge and Node runtimes

Date: 2026-08-09
Related: docs/design/2026-08-02-taller-saas-multitenant-design.md §4, §4.1

## Why this exists

Next.js Middleware (`src/middleware.ts`) always runs in the Edge runtime.
Prisma's query engine needs Node APIs to open a raw Postgres connection,
which the Edge runtime does not provide. Resolving a tenant fully — subdomain
parsing *and* the `public.Tenant` database lookup — cannot happen inside
`middleware.ts`.

## The split

1. **Edge (`src/middleware.ts`)**: pure Host-header parsing only, via
   `extractTenantSlug` (`src/lib/tenant/subdomain.ts` — no I/O, no Node APIs).
   Tags the request with an `x-tenant-slug` header (constant:
   `TENANT_SLUG_HEADER` in `src/lib/tenant/constants.ts`). Never imports
   Prisma or anything that transitively does.
2. **Node (`resolveTenant()` in `src/lib/tenant/resolve-tenant.ts`)**: called
   from Server Components, Server Actions, and NextAuth's `authorize()` —
   all Node runtime by default in this project. Reads the `x-tenant-slug`
   header via `next/headers` and queries `publicDb.tenant.findUnique(...)`.

## Consequence for future contributors

Do not "simplify" this by moving the `Tenant` lookup into `middleware.ts`,
and do not add `export const runtime = "edge"` to any route/layout that
calls `resolveTenant()` — either change breaks the split above and Prisma
will fail to connect at runtime.
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/tenant/constants.ts src/middleware.ts src/lib/tenant/resolve-tenant.ts src/lib/tenant/resolve-tenant.test.ts docs/design/notes/2026-08-09-tenant-resolution-edge-split.md
git commit -m "feat: split tenant resolution across Edge middleware and Node resolveTenant()"
```

---

### Task 9: NextAuth (Auth.js v5) — tenant-scoped Credentials provider

**Files:**
- Create: `src/lib/auth/verify-credentials.ts`
- Test: `src/lib/auth/verify-credentials.test.ts`
- Create: `src/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/types/next-auth.d.ts`

**Interfaces:**
- Consumes: `resolveTenant` (Task 8), `getTenantDb` (Task 5), the `Usuario` model and `Role` enum (Task 5).
- Produces: `auth`, `signIn`, `signOut`, `handlers` (exported from `src/auth.ts`, standard NextAuth v5 shape). Task 10 (`requireSession`/`requireRole`) calls `auth()`. Task 11 (login page) calls `signIn` (via `next-auth/react` client-side, hitting the route handler produced here). The session's `user.role`, `user.tenantSlug`, `user.tenantSchema` fields (typed via `src/types/next-auth.d.ts`) are consumed by Task 10's guards and by every server action in Tasks 12/14/16.

- [ ] **Step 1: Install NextAuth v5**

```bash
npm install next-auth@beta
```

Note: as of this plan's writing, Auth.js v5 is distributed under the `beta` npm dist-tag. Check `npm view next-auth@beta version` before installing — if a 5.x release has since been promoted to `latest`, install `next-auth@latest` instead and confirm the resolved version is still 5.x (the API in this task assumes v5's single `NextAuth(...)` config object returning `{ handlers, auth, signIn, signOut }`, not the v4 `authOptions` + `getServerSession` shape).

- [ ] **Step 2: Write the failing test for the credential-verification core**

Create `src/lib/auth/verify-credentials.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { verifyCredentials } from "./verify-credentials";
import type { TenantPrismaClient } from "@/lib/db/tenant-client";

function fakeTenantDb(usuario: unknown): TenantPrismaClient {
  return {
    usuario: { findUnique: vi.fn().mockResolvedValue(usuario) },
  } as unknown as TenantPrismaClient;
}

describe("verifyCredentials", () => {
  it("returns null when no Usuario matches the email", async () => {
    const tenantDb = fakeTenantDb(null);

    const result = await verifyCredentials(tenantDb, "nadie@example.com", "whatever");

    expect(result).toBeNull();
  });

  it("returns null when the password does not match the stored hash", async () => {
    const passwordHash = await bcrypt.hash("correct-password", 12);
    const tenantDb = fakeTenantDb({ id: "1", email: "a@example.com", passwordHash, role: "ADMIN" });

    const result = await verifyCredentials(tenantDb, "a@example.com", "wrong-password");

    expect(result).toBeNull();
  });

  it("returns the Usuario when the password matches", async () => {
    const passwordHash = await bcrypt.hash("correct-password", 12);
    const usuario = { id: "1", email: "a@example.com", passwordHash, role: "ADMIN" };
    const tenantDb = fakeTenantDb(usuario);

    const result = await verifyCredentials(tenantDb, "a@example.com", "correct-password");

    expect(result).toEqual(usuario);
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run src/lib/auth/verify-credentials.test.ts`
Expected: FAIL — `Cannot find module './verify-credentials'`.

- [ ] **Step 4: Implement `verifyCredentials`**

Create `src/lib/auth/verify-credentials.ts`:

```ts
import bcrypt from "bcryptjs";
import type { TenantPrismaClient } from "@/lib/db/tenant-client";
import type { Usuario } from "@/generated/prisma-tenant";

export async function verifyCredentials(
  tenantDb: TenantPrismaClient,
  email: string,
  password: string,
): Promise<Usuario | null> {
  const usuario = await tenantDb.usuario.findUnique({ where: { email } });
  if (!usuario) return null;

  const matches = await bcrypt.compare(password, usuario.passwordHash);
  if (!matches) return null;

  return usuario;
}
```

- [ ] **Step 5: Run the tests again to confirm they pass**

Run: `npx vitest run src/lib/auth/verify-credentials.test.ts`
Expected: PASS — 3 tests passed.

- [ ] **Step 6: Write the NextAuth config**

Create `src/auth.ts`:

```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { resolveTenant } from "@/lib/tenant/resolve-tenant";
import { getTenantDb } from "@/lib/db/tenant-client";
import { verifyCredentials } from "@/lib/auth/verify-credentials";

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Correo", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const tenant = await resolveTenant();
        if (!tenant) return null;

        const tenantDb = getTenantDb(tenant.schemaName);
        const usuario = await verifyCredentials(tenantDb, email, password);
        if (!usuario) return null;

        return {
          id: usuario.id,
          email: usuario.email,
          name: usuario.nombre,
          role: usuario.role,
          tenantSlug: tenant.slug,
          tenantSchema: tenant.schemaName,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.tenantSlug = user.tenantSlug;
        token.tenantSchema = user.tenantSchema;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.sub as string;
      session.user.role = token.role as "ADMIN" | "TECNICO" | "RECEPCION";
      session.user.tenantSlug = token.tenantSlug as string;
      session.user.tenantSchema = token.tenantSchema as string;
      return session;
    },
  },
});
```

- [ ] **Step 7: Wire the route handler**

Create `src/app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 8: Add the session/user/JWT type augmentation**

Create `src/types/next-auth.d.ts`:

```ts
import type { DefaultSession } from "next-auth";

type TorqueFlowRole = "ADMIN" | "TECNICO" | "RECEPCION";

declare module "next-auth" {
  interface User {
    role: TorqueFlowRole;
    tenantSlug: string;
    tenantSchema: string;
  }

  interface Session {
    user: {
      id: string;
      role: TorqueFlowRole;
      tenantSlug: string;
      tenantSchema: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: TorqueFlowRole;
    tenantSlug?: string;
    tenantSchema?: string;
  }
}
```

- [ ] **Step 9: Type-check the new auth module**

Run: `npx tsc --noEmit`
Expected: no errors referencing `src/auth.ts`, `src/types/next-auth.d.ts`, or `src/app/api/auth/[...nextauth]/route.ts`.

- [ ] **Step 10: Commit**

```bash
git add src/lib/auth/verify-credentials.ts src/lib/auth/verify-credentials.test.ts src/auth.ts src/app/api/auth/[...nextauth]/route.ts src/types/next-auth.d.ts package.json package-lock.json
git commit -m "feat: add tenant-scoped NextAuth Credentials provider"
```

---

### Task 10: Auth guard helpers — `requireSession`, `requireRole`

**Files:**
- Create: `src/lib/auth/guards.ts`
- Test: `src/lib/auth/guards.test.ts`

**Interfaces:**
- Consumes: `auth` (Task 9).
- Produces: `requireSession(): Promise<Session>` and `requireRole(allowed: Role[]): Promise<Session>` (where `Role = "ADMIN" | "TECNICO" | "RECEPCION"`, re-exported here as `type Role`). Task 12's dashboard layout calls `requireSession()`; every server action in Tasks 12/14/16 calls `requireRole([...])`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/auth/guards.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

const mockRedirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => mockRedirect(url) }));

import { requireSession, requireRole } from "./guards";

describe("requireSession", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockRedirect.mockClear();
  });

  it("returns the session when one exists", async () => {
    const session = { user: { id: "1", role: "ADMIN" } };
    mockAuth.mockResolvedValue(session);

    await expect(requireSession()).resolves.toBe(session);
  });

  it("redirects to /login when there is no session", async () => {
    mockAuth.mockResolvedValue(null);

    await expect(requireSession()).rejects.toThrow("REDIRECT:/login");
  });
});

describe("requireRole", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockRedirect.mockClear();
  });

  it("returns the session when the user's role is allowed", async () => {
    const session = { user: { id: "1", role: "RECEPCION" } };
    mockAuth.mockResolvedValue(session);

    await expect(requireRole(["ADMIN", "RECEPCION"])).resolves.toBe(session);
  });

  it("redirects when the user's role is not allowed", async () => {
    const session = { user: { id: "1", role: "TECNICO" } };
    mockAuth.mockResolvedValue(session);

    await expect(requireRole(["ADMIN"])).rejects.toThrow("REDIRECT:/login?error=forbidden");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/auth/guards.test.ts`
Expected: FAIL — `Cannot find module './guards'`.

- [ ] **Step 3: Implement the guards**

Create `src/lib/auth/guards.ts`:

```ts
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export type Role = "ADMIN" | "TECNICO" | "RECEPCION";

type Session = NonNullable<Awaited<ReturnType<typeof auth>>>;

export async function requireSession(): Promise<Session> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return session;
}

export async function requireRole(allowed: Role[]): Promise<Session> {
  const session = await requireSession();
  if (!allowed.includes(session.user.role)) {
    redirect("/login?error=forbidden");
  }
  return session;
}
```

- [ ] **Step 4: Run the tests again to confirm they pass**

Run: `npx vitest run src/lib/auth/guards.test.ts`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/guards.ts src/lib/auth/guards.test.ts
git commit -m "feat: add requireSession/requireRole auth guards"
```

---

### Task 11: Login page — tenant-scoped credentials UI

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/app/login/login-form.tsx`
- Test: `src/app/login/login-form.test.tsx`

**Interfaces:**
- Consumes: `signIn` from `next-auth/react` (client-side call into the route handler from Task 9).
- Produces: the `/login` route, which is where `requireSession` (Task 10) redirects unauthenticated users, and where Task 17's e2e test starts its flow.

- [ ] **Step 1: Write the failing component test**

Create `src/app/login/login-form.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSignIn = vi.fn();
const mockPush = vi.fn();

vi.mock("next-auth/react", () => ({ signIn: (...args: unknown[]) => mockSignIn(...args) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

import { LoginForm } from "./login-form";

describe("LoginForm", () => {
  beforeEach(() => {
    mockSignIn.mockReset();
    mockPush.mockReset();
  });

  it("submits email and password to signIn with the credentials provider", async () => {
    mockSignIn.mockResolvedValue({ ok: true, error: null });
    render(<LoginForm />);

    await userEvent.type(screen.getByLabelText("Correo"), "admin@taller-perez.test");
    await userEvent.type(screen.getByLabelText("Contraseña"), "SuperSecret123!");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(mockSignIn).toHaveBeenCalledWith("credentials", {
      email: "admin@taller-perez.test",
      password: "SuperSecret123!",
      redirect: false,
    });
  });

  it("redirects to /clientes after a successful login", async () => {
    mockSignIn.mockResolvedValue({ ok: true, error: null });
    render(<LoginForm />);

    await userEvent.type(screen.getByLabelText("Correo"), "admin@taller-perez.test");
    await userEvent.type(screen.getByLabelText("Contraseña"), "SuperSecret123!");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(mockPush).toHaveBeenCalledWith("/clientes");
  });

  it("shows an error message when signIn fails", async () => {
    mockSignIn.mockResolvedValue({ ok: false, error: "CredentialsSignin" });
    render(<LoginForm />);

    await userEvent.type(screen.getByLabelText("Correo"), "admin@taller-perez.test");
    await userEvent.type(screen.getByLabelText("Contraseña"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Correo o contraseña incorrectos");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/app/login/login-form.test.tsx`
Expected: FAIL — `Cannot find module './login-form'`.

- [ ] **Step 3: Implement the login form**

Create `src/app/login/login-form.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    const result = await signIn("credentials", { email, password, redirect: false });
    setIsPending(false);

    if (!result?.ok) {
      setError("Correo o contraseña incorrectos");
      return;
    }

    router.push("/clientes");
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="email">Correo</label>
      <input id="email" name="email" type="email" required />

      <label htmlFor="password">Contraseña</label>
      <input id="password" name="password" type="password" required />

      <button type="submit" disabled={isPending}>
        {isPending ? "Ingresando..." : "Ingresar"}
      </button>

      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
```

- [ ] **Step 4: Run the tests again to confirm they pass**

Run: `npx vitest run src/app/login/login-form.test.tsx`
Expected: PASS — 3 tests passed.

- [ ] **Step 5: Wire the page**

Create `src/app/login/page.tsx`:

```tsx
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main style={{ padding: "2rem", maxWidth: "24rem", margin: "0 auto" }}>
      <h1>Ingresar a TorqueFlow</h1>
      <LoginForm />
    </main>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/app/login/page.tsx src/app/login/login-form.tsx src/app/login/login-form.test.tsx
git commit -m "feat: add tenant-scoped login page"
```

---

### Task 12: Módulo 1 — Cliente server actions (CRUD)

**Testing strategy note:** these server actions are unit-tested with `getTenantDb`, `resolveTenant`, and `requireRole` mocked (fast, no live Postgres needed) — the same pattern established in Tasks 8 and 10. Live-database coverage for this data path already exists at the Prisma layer (Tasks 5-6) and is exercised end-to-end again in Task 17's Playwright smoke test; re-doing full DB integration tests for every CRUD action here would be redundant with both.

**Files:**
- Create: `src/lib/validation/cliente.ts`
- Create: `src/app/actions/cliente-actions.ts`
- Test: `src/app/actions/cliente-actions.test.ts`
- Create: `src/app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `requireRole`/`requireSession` (Task 10), `resolveTenant` (Task 8), `getTenantDb` (Task 5), the `Cliente` type (Task 5).
- Produces: `listClientes(): Promise<Cliente[]>`, `getCliente(id: string): Promise<(Cliente & { vehiculos: Vehiculo[] }) | null>`, `type ClienteFormState = { error: string | null; success: boolean }`, `createClienteAction(prevState: ClienteFormState, formData: FormData): Promise<ClienteFormState>`, `updateClienteAction(id: string, prevState: ClienteFormState, formData: FormData): Promise<ClienteFormState>`, `deleteClienteAction(id: string): Promise<void>`. Task 13 (Cliente UI) and Task 15 (Cliente detail page) consume all of these. `getCliente`'s `vehiculos` field is what Task 15's detail page and Task 14's Vehiculo actions build on.

- [ ] **Step 1: Install zod**

```bash
npm install zod
```

- [ ] **Step 2: Write the Cliente validation schema**

Create `src/lib/validation/cliente.ts`:

```ts
import { z } from "zod";

export const clienteInputSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  telefono: z.string().optional().or(z.literal("")),
  email: z.string().email("Correo inválido").optional().or(z.literal("")),
  documento: z.string().optional().or(z.literal("")),
});

export type ClienteInput = z.infer<typeof clienteInputSchema>;
```

- [ ] **Step 3: Write the failing tests for the server actions**

Create `src/app/actions/cliente-actions.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockResolveTenant = vi.fn();
vi.mock("@/lib/tenant/resolve-tenant", () => ({ resolveTenant: () => mockResolveTenant() }));

const mockCreate = vi.fn();
const mockFindMany = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({ cliente: { create: mockCreate, findMany: mockFindMany } }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createClienteAction, listClientes, type ClienteFormState } from "./cliente-actions";

const initialState: ClienteFormState = { error: null, success: false };

describe("createClienteAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN" } });
    mockResolveTenant.mockReset().mockResolvedValue({ slug: "taller-perez", schemaName: "taller_perez" });
    mockCreate.mockReset();
  });

  it("returns a validation error and does not touch the database when nombre is missing", async () => {
    const formData = new FormData();
    formData.set("nombre", "");

    const result = await createClienteAction(initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("El nombre es obligatorio");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the Cliente in the resolved tenant's schema on valid input", async () => {
    mockCreate.mockResolvedValue({ id: "c1", nombre: "Juan Pérez" });
    const formData = new FormData();
    formData.set("nombre", "Juan Pérez");
    formData.set("telefono", "555-1234");
    formData.set("email", "");
    formData.set("documento", "");

    const result = await createClienteAction(initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(mockCreate).toHaveBeenCalledWith({
      data: { nombre: "Juan Pérez", telefono: "555-1234", email: null, documento: null },
    });
  });
});

describe("listClientes", () => {
  beforeEach(() => {
    mockRequireSession.mockReset().mockResolvedValue({ user: { role: "TECNICO" } });
    mockResolveTenant.mockReset().mockResolvedValue({ slug: "taller-perez", schemaName: "taller_perez" });
    mockFindMany.mockReset();
  });

  it("lists clientes for the resolved tenant, ordered by nombre", async () => {
    mockFindMany.mockResolvedValue([{ id: "c1", nombre: "Ana" }]);

    const result = await listClientes();

    expect(result).toEqual([{ id: "c1", nombre: "Ana" }]);
    expect(mockFindMany).toHaveBeenCalledWith({ orderBy: { nombre: "asc" } });
  });
});
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `npx vitest run src/app/actions/cliente-actions.test.ts`
Expected: FAIL — `Cannot find module './cliente-actions'`.

- [ ] **Step 5: Implement the Cliente server actions**

Create `src/app/actions/cliente-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { resolveTenant } from "@/lib/tenant/resolve-tenant";
import { getTenantDb } from "@/lib/db/tenant-client";
import { clienteInputSchema, type ClienteInput } from "@/lib/validation/cliente";
import type { Cliente, Vehiculo } from "@/generated/prisma-tenant";

export interface ClienteFormState {
  error: string | null;
  success: boolean;
}

async function tenantDbOrThrow() {
  const tenant = await resolveTenant();
  if (!tenant) throw new Error("No se pudo resolver el taller actual");
  return getTenantDb(tenant.schemaName);
}

async function createCliente(input: ClienteInput): Promise<Cliente> {
  await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = await tenantDbOrThrow();
  return tenantDb.cliente.create({
    data: {
      nombre: input.nombre,
      telefono: input.telefono || null,
      email: input.email || null,
      documento: input.documento || null,
    },
  });
}

async function updateCliente(id: string, input: ClienteInput): Promise<Cliente> {
  await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = await tenantDbOrThrow();
  return tenantDb.cliente.update({
    where: { id },
    data: {
      nombre: input.nombre,
      telefono: input.telefono || null,
      email: input.email || null,
      documento: input.documento || null,
    },
  });
}

function parseClienteFormData(formData: FormData) {
  return clienteInputSchema.safeParse({
    nombre: formData.get("nombre"),
    telefono: formData.get("telefono"),
    email: formData.get("email"),
    documento: formData.get("documento"),
  });
}

export async function listClientes(): Promise<Cliente[]> {
  await requireSession();
  const tenantDb = await tenantDbOrThrow();
  return tenantDb.cliente.findMany({ orderBy: { nombre: "asc" } });
}

export async function getCliente(id: string): Promise<(Cliente & { vehiculos: Vehiculo[] }) | null> {
  await requireSession();
  const tenantDb = await tenantDbOrThrow();
  return tenantDb.cliente.findUnique({ where: { id }, include: { vehiculos: true } });
}

export async function createClienteAction(
  prevState: ClienteFormState,
  formData: FormData,
): Promise<ClienteFormState> {
  const parsed = parseClienteFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  try {
    await createCliente(parsed.data);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al crear cliente", success: false };
  }

  revalidatePath("/clientes");
  return { error: null, success: true };
}

export async function updateClienteAction(
  id: string,
  prevState: ClienteFormState,
  formData: FormData,
): Promise<ClienteFormState> {
  const parsed = parseClienteFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  try {
    await updateCliente(id, parsed.data);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al actualizar cliente", success: false };
  }

  revalidatePath(`/clientes/${id}`);
  return { error: null, success: true };
}

export async function deleteClienteAction(id: string): Promise<void> {
  await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = await tenantDbOrThrow();
  await tenantDb.cliente.delete({ where: { id } });
  revalidatePath("/clientes");
}
```

- [ ] **Step 6: Run the tests again to confirm they pass**

Run: `npx vitest run src/app/actions/cliente-actions.test.ts`
Expected: PASS — 3 tests passed.

- [ ] **Step 7: Add the dashboard route group layout**

Create `src/app/(dashboard)/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { requireSession } from "@/lib/auth/guards";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await requireSession();
  return <div style={{ padding: "2rem" }}>{children}</div>;
}
```

This centralizes the "must be logged in" check for every page under `(dashboard)` (Tasks 13/15/16); individual server actions still call `requireRole`/`requireSession` themselves too, since actions can also be invoked outside of a page render (defense in depth, not redundant — a page-level check only guards the initial render).

- [ ] **Step 8: Commit**

```bash
git add src/lib/validation/cliente.ts src/app/actions/cliente-actions.ts src/app/actions/cliente-actions.test.ts src/app/\(dashboard\)/layout.tsx package.json package-lock.json
git commit -m "feat: add Cliente server actions and dashboard layout guard"
```

---

### Task 13: Cliente UI — list + create form

**Files:**
- Create: `src/app/(dashboard)/clientes/page.tsx`
- Create: `src/app/(dashboard)/clientes/nuevo-cliente-form.tsx`
- Test: `src/app/(dashboard)/clientes/nuevo-cliente-form.test.tsx`

**Interfaces:**
- Consumes: `createClienteAction`, `type ClienteFormState` (Task 12), `listClientes` (Task 12).
- Produces: the `/clientes` route (the login redirect target from Task 11) and the `NuevoClienteForm` component pattern that Task 15 mirrors for `NuevoVehiculoForm`.

- [ ] **Step 1: Write the failing component test**

Create `src/app/(dashboard)/clientes/nuevo-cliente-form.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCreateClienteAction = vi.fn();
vi.mock("@/app/actions/cliente-actions", () => ({
  createClienteAction: (...args: unknown[]) => mockCreateClienteAction(...args),
}));

import { NuevoClienteForm } from "./nuevo-cliente-form";

describe("NuevoClienteForm", () => {
  beforeEach(() => {
    mockCreateClienteAction.mockReset();
    mockCreateClienteAction.mockResolvedValue({ error: null, success: true });
  });

  it("renders all Cliente fields", () => {
    render(<NuevoClienteForm />);

    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
    expect(screen.getByLabelText("Teléfono")).toBeInTheDocument();
    expect(screen.getByLabelText("Correo")).toBeInTheDocument();
    expect(screen.getByLabelText("Documento")).toBeInTheDocument();
  });

  it("shows a success message after a successful submit", async () => {
    render(<NuevoClienteForm />);

    await userEvent.type(screen.getByLabelText("Nombre"), "Juan Pérez");
    await userEvent.click(screen.getByRole("button", { name: "Crear cliente" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Cliente creado");
  });

  it("shows the error message when the action returns one", async () => {
    mockCreateClienteAction.mockResolvedValue({ error: "El nombre es obligatorio", success: false });
    render(<NuevoClienteForm />);

    await userEvent.click(screen.getByRole("button", { name: "Crear cliente" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El nombre es obligatorio");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run "src/app/(dashboard)/clientes/nuevo-cliente-form.test.tsx"`
Expected: FAIL — `Cannot find module './nuevo-cliente-form'`.

- [ ] **Step 3: Implement the create-Cliente form**

Create `src/app/(dashboard)/clientes/nuevo-cliente-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { createClienteAction, type ClienteFormState } from "@/app/actions/cliente-actions";

const initialState: ClienteFormState = { error: null, success: false };

export function NuevoClienteForm() {
  const [state, formAction, isPending] = useActionState(createClienteAction, initialState);

  return (
    <form action={formAction}>
      <label htmlFor="nombre">Nombre</label>
      <input id="nombre" name="nombre" required />

      <label htmlFor="telefono">Teléfono</label>
      <input id="telefono" name="telefono" />

      <label htmlFor="email">Correo</label>
      <input id="email" name="email" type="email" />

      <label htmlFor="documento">Documento</label>
      <input id="documento" name="documento" />

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Crear cliente"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Cliente creado</p> : null}
    </form>
  );
}
```

- [ ] **Step 4: Run the tests again to confirm they pass**

Run: `npx vitest run "src/app/(dashboard)/clientes/nuevo-cliente-form.test.tsx"`
Expected: PASS — 3 tests passed.

- [ ] **Step 5: Wire the Clientes list page**

Create `src/app/(dashboard)/clientes/page.tsx`:

```tsx
import Link from "next/link";
import { listClientes } from "@/app/actions/cliente-actions";
import { NuevoClienteForm } from "./nuevo-cliente-form";

export default async function ClientesPage() {
  const clientes = await listClientes();

  return (
    <main>
      <h1>Clientes</h1>
      <NuevoClienteForm />
      <ul>
        {clientes.map((cliente) => (
          <li key={cliente.id}>
            <Link href={`/clientes/${cliente.id}`}>{cliente.nombre}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/clientes/page.tsx" "src/app/(dashboard)/clientes/nuevo-cliente-form.tsx" "src/app/(dashboard)/clientes/nuevo-cliente-form.test.tsx"
git commit -m "feat: add Cliente list page and create form"
```

---

### Task 14: Vehiculo server actions (CRUD, scoped to a Cliente)

**Files:**
- Create: `src/lib/validation/vehiculo.ts`
- Create: `src/app/actions/vehiculo-actions.ts`
- Test: `src/app/actions/vehiculo-actions.test.ts`

**Interfaces:**
- Consumes: `requireRole`/`requireSession` (Task 10), `resolveTenant` (Task 8), `getTenantDb` (Task 5), the `Vehiculo` type (Task 5).
- Produces: `listVehiculosByCliente(clienteId: string): Promise<Vehiculo[]>`, `getVehiculo(id: string): Promise<Vehiculo | null>`, `type VehiculoFormState = { error: string | null; success: boolean }`, `createVehiculoAction(clienteId: string, prevState: VehiculoFormState, formData: FormData): Promise<VehiculoFormState>`, `deleteVehiculoAction(id: string, clienteId: string): Promise<void>`. Task 15 (Vehiculo UI on the Cliente detail page) and Task 16 (Historial, which needs to load the parent Vehiculo) both consume these.

- [ ] **Step 1: Write the Vehiculo validation schema**

Create `src/lib/validation/vehiculo.ts`:

```ts
import { z } from "zod";

export const vehiculoInputSchema = z.object({
  placa: z.string().min(1, "La placa es obligatoria"),
  marca: z.string().min(1, "La marca es obligatoria"),
  modelo: z.string().min(1, "El modelo es obligatorio"),
  anio: z.coerce.number().int().min(1900).max(2100).optional(),
});

export type VehiculoInput = z.infer<typeof vehiculoInputSchema>;
```

- [ ] **Step 2: Write the failing tests**

Create `src/app/actions/vehiculo-actions.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockResolveTenant = vi.fn();
vi.mock("@/lib/tenant/resolve-tenant", () => ({ resolveTenant: () => mockResolveTenant() }));

const mockCreate = vi.fn();
const mockFindMany = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({ vehiculo: { create: mockCreate, findMany: mockFindMany } }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createVehiculoAction,
  listVehiculosByCliente,
  type VehiculoFormState,
} from "./vehiculo-actions";

const initialState: VehiculoFormState = { error: null, success: false };

describe("createVehiculoAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN" } });
    mockResolveTenant.mockReset().mockResolvedValue({ slug: "taller-perez", schemaName: "taller_perez" });
    mockCreate.mockReset();
  });

  it("returns a validation error when placa is missing", async () => {
    const formData = new FormData();
    formData.set("marca", "Toyota");
    formData.set("modelo", "Corolla");

    const result = await createVehiculoAction("c1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("La placa es obligatoria");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the Vehiculo linked to the given clienteId on valid input", async () => {
    mockCreate.mockResolvedValue({ id: "v1", placa: "ABC123" });
    const formData = new FormData();
    formData.set("placa", "ABC123");
    formData.set("marca", "Toyota");
    formData.set("modelo", "Corolla");
    formData.set("anio", "2020");

    const result = await createVehiculoAction("c1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockCreate).toHaveBeenCalledWith({
      data: { placa: "ABC123", marca: "Toyota", modelo: "Corolla", anio: 2020, clienteId: "c1" },
    });
  });
});

describe("listVehiculosByCliente", () => {
  beforeEach(() => {
    mockRequireSession.mockReset().mockResolvedValue({ user: { role: "TECNICO" } });
    mockResolveTenant.mockReset().mockResolvedValue({ slug: "taller-perez", schemaName: "taller_perez" });
    mockFindMany.mockReset();
  });

  it("lists vehiculos for the given clienteId, ordered by placa", async () => {
    mockFindMany.mockResolvedValue([{ id: "v1", placa: "ABC123" }]);

    const result = await listVehiculosByCliente("c1");

    expect(result).toEqual([{ id: "v1", placa: "ABC123" }]);
    expect(mockFindMany).toHaveBeenCalledWith({ where: { clienteId: "c1" }, orderBy: { placa: "asc" } });
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run src/app/actions/vehiculo-actions.test.ts`
Expected: FAIL — `Cannot find module './vehiculo-actions'`.

- [ ] **Step 4: Implement the Vehiculo server actions**

Create `src/app/actions/vehiculo-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { resolveTenant } from "@/lib/tenant/resolve-tenant";
import { getTenantDb } from "@/lib/db/tenant-client";
import { vehiculoInputSchema } from "@/lib/validation/vehiculo";
import type { Vehiculo } from "@/generated/prisma-tenant";

export interface VehiculoFormState {
  error: string | null;
  success: boolean;
}

async function tenantDbOrThrow() {
  const tenant = await resolveTenant();
  if (!tenant) throw new Error("No se pudo resolver el taller actual");
  return getTenantDb(tenant.schemaName);
}

export async function listVehiculosByCliente(clienteId: string): Promise<Vehiculo[]> {
  await requireSession();
  const tenantDb = await tenantDbOrThrow();
  return tenantDb.vehiculo.findMany({ where: { clienteId }, orderBy: { placa: "asc" } });
}

export async function getVehiculo(id: string): Promise<Vehiculo | null> {
  await requireSession();
  const tenantDb = await tenantDbOrThrow();
  return tenantDb.vehiculo.findUnique({ where: { id } });
}

export async function createVehiculoAction(
  clienteId: string,
  prevState: VehiculoFormState,
  formData: FormData,
): Promise<VehiculoFormState> {
  const parsed = vehiculoInputSchema.safeParse({
    placa: formData.get("placa"),
    marca: formData.get("marca"),
    modelo: formData.get("modelo"),
    anio: formData.get("anio") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = await tenantDbOrThrow();

  try {
    await tenantDb.vehiculo.create({
      data: {
        placa: parsed.data.placa,
        marca: parsed.data.marca,
        modelo: parsed.data.modelo,
        anio: parsed.data.anio,
        clienteId,
      },
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al crear vehículo", success: false };
  }

  revalidatePath(`/clientes/${clienteId}`);
  return { error: null, success: true };
}

export async function deleteVehiculoAction(id: string, clienteId: string): Promise<void> {
  await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = await tenantDbOrThrow();
  await tenantDb.vehiculo.delete({ where: { id } });
  revalidatePath(`/clientes/${clienteId}`);
}
```

- [ ] **Step 5: Run the tests again to confirm they pass**

Run: `npx vitest run src/app/actions/vehiculo-actions.test.ts`
Expected: PASS — 3 tests passed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/validation/vehiculo.ts src/app/actions/vehiculo-actions.ts src/app/actions/vehiculo-actions.test.ts
git commit -m "feat: add Vehiculo server actions scoped to a Cliente"
```

---

### Task 15: Cliente detail page + Vehiculo UI

**Files:**
- Create: `src/app/(dashboard)/clientes/[id]/page.tsx`
- Create: `src/app/(dashboard)/clientes/[id]/nuevo-vehiculo-form.tsx`
- Test: `src/app/(dashboard)/clientes/[id]/nuevo-vehiculo-form.test.tsx`

**Interfaces:**
- Consumes: `getCliente` (Task 12), `createVehiculoAction`, `type VehiculoFormState` (Task 14).
- Produces: the `/clientes/[id]` route, linked from Task 13's Clientes list, and the vehiculo-detail links (`/vehiculos/[id]`) that Task 16's Historial page resolves.

- [ ] **Step 1: Write the failing component test**

Create `src/app/(dashboard)/clientes/[id]/nuevo-vehiculo-form.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCreateVehiculoAction = vi.fn();
vi.mock("@/app/actions/vehiculo-actions", () => ({
  createVehiculoAction: (...args: unknown[]) => mockCreateVehiculoAction(...args),
}));

import { NuevoVehiculoForm } from "./nuevo-vehiculo-form";

describe("NuevoVehiculoForm", () => {
  beforeEach(() => {
    mockCreateVehiculoAction.mockReset();
    mockCreateVehiculoAction.mockResolvedValue({ error: null, success: true });
  });

  it("renders placa, marca, modelo, anio fields", () => {
    render(<NuevoVehiculoForm clienteId="c1" />);

    expect(screen.getByLabelText("Placa")).toBeInTheDocument();
    expect(screen.getByLabelText("Marca")).toBeInTheDocument();
    expect(screen.getByLabelText("Modelo")).toBeInTheDocument();
    expect(screen.getByLabelText("Año")).toBeInTheDocument();
  });

  it("shows a success message after a successful submit", async () => {
    render(<NuevoVehiculoForm clienteId="c1" />);

    await userEvent.type(screen.getByLabelText("Placa"), "ABC123");
    await userEvent.type(screen.getByLabelText("Marca"), "Toyota");
    await userEvent.type(screen.getByLabelText("Modelo"), "Corolla");
    await userEvent.click(screen.getByRole("button", { name: "Agregar vehículo" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Vehículo agregado");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run "src/app/(dashboard)/clientes/[id]/nuevo-vehiculo-form.test.tsx"`
Expected: FAIL — `Cannot find module './nuevo-vehiculo-form'`.

- [ ] **Step 3: Implement the create-Vehiculo form**

Create `src/app/(dashboard)/clientes/[id]/nuevo-vehiculo-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { createVehiculoAction, type VehiculoFormState } from "@/app/actions/vehiculo-actions";

const initialState: VehiculoFormState = { error: null, success: false };

export function NuevoVehiculoForm({ clienteId }: { clienteId: string }) {
  const createVehiculoForCliente = createVehiculoAction.bind(null, clienteId);
  const [state, formAction, isPending] = useActionState(createVehiculoForCliente, initialState);

  return (
    <form action={formAction}>
      <label htmlFor="placa">Placa</label>
      <input id="placa" name="placa" required />

      <label htmlFor="marca">Marca</label>
      <input id="marca" name="marca" required />

      <label htmlFor="modelo">Modelo</label>
      <input id="modelo" name="modelo" required />

      <label htmlFor="anio">Año</label>
      <input id="anio" name="anio" type="number" min="1900" max="2100" />

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Agregar vehículo"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Vehículo agregado</p> : null}
    </form>
  );
}
```

- [ ] **Step 4: Run the tests again to confirm they pass**

Run: `npx vitest run "src/app/(dashboard)/clientes/[id]/nuevo-vehiculo-form.test.tsx"`
Expected: PASS — 2 tests passed.

- [ ] **Step 5: Wire the Cliente detail page**

Create `src/app/(dashboard)/clientes/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCliente } from "@/app/actions/cliente-actions";
import { NuevoVehiculoForm } from "./nuevo-vehiculo-form";

export default async function ClienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cliente = await getCliente(id);

  if (!cliente) {
    notFound();
  }

  return (
    <main>
      <h1>{cliente.nombre}</h1>
      <p>Teléfono: {cliente.telefono ?? "—"}</p>
      <p>Correo: {cliente.email ?? "—"}</p>
      <p>Documento: {cliente.documento ?? "—"}</p>

      <h2>Vehículos</h2>
      <NuevoVehiculoForm clienteId={cliente.id} />
      <ul>
        {cliente.vehiculos.map((vehiculo) => (
          <li key={vehiculo.id}>
            <Link href={`/vehiculos/${vehiculo.id}`}>
              {vehiculo.placa} — {vehiculo.marca} {vehiculo.modelo}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/clientes/[id]/page.tsx" "src/app/(dashboard)/clientes/[id]/nuevo-vehiculo-form.tsx" "src/app/(dashboard)/clientes/[id]/nuevo-vehiculo-form.test.tsx"
git commit -m "feat: add Cliente detail page with Vehiculo list and create form"
```

---

### Task 16: Historial de vehículo — server actions + view

**Scope note:** Órdenes de trabajo (module 2 of the design doc, §5) is out of scope for this phase, so it can't auto-populate a vehicle's history the way it eventually will. For now, `HistorialVehiculo` is a manually-entered log entry (free-text description + timestamp + optional author), added directly by staff — not generated by any other module.

**Files:**
- Create: `src/lib/validation/historial.ts`
- Create: `src/app/actions/historial-actions.ts`
- Test: `src/app/actions/historial-actions.test.ts`
- Create: `src/app/(dashboard)/vehiculos/[id]/page.tsx`
- Create: `src/app/(dashboard)/vehiculos/[id]/nueva-entrada-form.tsx`
- Test: `src/app/(dashboard)/vehiculos/[id]/nueva-entrada-form.test.tsx`

**Interfaces:**
- Consumes: `requireRole`/`requireSession` (Task 10), `resolveTenant` (Task 8), `getTenantDb` (Task 5), `getVehiculo` (Task 14), the `HistorialVehiculo` type (Task 5).
- Produces: `listHistorial(vehiculoId: string): Promise<HistorialVehiculo[]>`, `type HistorialFormState = { error: string | null; success: boolean }`, `addHistorialEntryAction(vehiculoId: string, prevState: HistorialFormState, formData: FormData): Promise<HistorialFormState>`, and the `/vehiculos/[id]` route linked from Task 15. Task 17's e2e test drives this page directly.

- [ ] **Step 1: Write the Historial validation schema**

Create `src/lib/validation/historial.ts`:

```ts
import { z } from "zod";

export const historialInputSchema = z.object({
  descripcion: z.string().min(1, "La descripción es obligatoria"),
});

export type HistorialInput = z.infer<typeof historialInputSchema>;
```

- [ ] **Step 2: Write the failing tests for the server actions**

Create `src/app/actions/historial-actions.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockResolveTenant = vi.fn();
vi.mock("@/lib/tenant/resolve-tenant", () => ({ resolveTenant: () => mockResolveTenant() }));

const mockCreate = vi.fn();
const mockFindMany = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({ historialVehiculo: { create: mockCreate, findMany: mockFindMany } }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  addHistorialEntryAction,
  listHistorial,
  type HistorialFormState,
} from "./historial-actions";

const initialState: HistorialFormState = { error: null, success: false };

describe("addHistorialEntryAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { id: "u1", role: "TECNICO" } });
    mockResolveTenant.mockReset().mockResolvedValue({ slug: "taller-perez", schemaName: "taller_perez" });
    mockCreate.mockReset();
  });

  it("returns a validation error when descripcion is empty", async () => {
    const formData = new FormData();
    formData.set("descripcion", "");

    const result = await addHistorialEntryAction("v1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("La descripción es obligatoria");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the entry linked to the vehiculo and the current user, and allows TECNICO", async () => {
    mockCreate.mockResolvedValue({ id: "h1", descripcion: "Cambio de aceite" });
    const formData = new FormData();
    formData.set("descripcion", "Cambio de aceite");

    const result = await addHistorialEntryAction("v1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION", "TECNICO"]);
    expect(mockCreate).toHaveBeenCalledWith({
      data: { descripcion: "Cambio de aceite", vehiculoId: "v1", autorId: "u1" },
    });
  });
});

describe("listHistorial", () => {
  beforeEach(() => {
    mockRequireSession.mockReset().mockResolvedValue({ user: { role: "TECNICO" } });
    mockResolveTenant.mockReset().mockResolvedValue({ slug: "taller-perez", schemaName: "taller_perez" });
    mockFindMany.mockReset();
  });

  it("lists historial entries for the vehiculo, most recent first", async () => {
    mockFindMany.mockResolvedValue([{ id: "h1", descripcion: "Cambio de aceite" }]);

    const result = await listHistorial("v1");

    expect(result).toEqual([{ id: "h1", descripcion: "Cambio de aceite" }]);
    expect(mockFindMany).toHaveBeenCalledWith({ where: { vehiculoId: "v1" }, orderBy: { fecha: "desc" } });
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run src/app/actions/historial-actions.test.ts`
Expected: FAIL — `Cannot find module './historial-actions'`.

- [ ] **Step 4: Implement the Historial server actions**

Create `src/app/actions/historial-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { resolveTenant } from "@/lib/tenant/resolve-tenant";
import { getTenantDb } from "@/lib/db/tenant-client";
import { historialInputSchema } from "@/lib/validation/historial";
import type { HistorialVehiculo } from "@/generated/prisma-tenant";

export interface HistorialFormState {
  error: string | null;
  success: boolean;
}

async function tenantDbOrThrow() {
  const tenant = await resolveTenant();
  if (!tenant) throw new Error("No se pudo resolver el taller actual");
  return getTenantDb(tenant.schemaName);
}

export async function listHistorial(vehiculoId: string): Promise<HistorialVehiculo[]> {
  await requireSession();
  const tenantDb = await tenantDbOrThrow();
  return tenantDb.historialVehiculo.findMany({
    where: { vehiculoId },
    orderBy: { fecha: "desc" },
  });
}

export async function addHistorialEntryAction(
  vehiculoId: string,
  prevState: HistorialFormState,
  formData: FormData,
): Promise<HistorialFormState> {
  const parsed = historialInputSchema.safeParse({ descripcion: formData.get("descripcion") });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION", "TECNICO"]);
  const tenantDb = await tenantDbOrThrow();

  try {
    await tenantDb.historialVehiculo.create({
      data: { descripcion: parsed.data.descripcion, vehiculoId, autorId: session.user.id },
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al registrar entrada", success: false };
  }

  revalidatePath(`/vehiculos/${vehiculoId}`);
  return { error: null, success: true };
}
```

- [ ] **Step 5: Run the tests again to confirm they pass**

Run: `npx vitest run src/app/actions/historial-actions.test.ts`
Expected: PASS — 3 tests passed.

- [ ] **Step 6: Write the failing component test for the add-entry form**

Create `src/app/(dashboard)/vehiculos/[id]/nueva-entrada-form.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAddHistorialEntryAction = vi.fn();
vi.mock("@/app/actions/historial-actions", () => ({
  addHistorialEntryAction: (...args: unknown[]) => mockAddHistorialEntryAction(...args),
}));

import { NuevaEntradaForm } from "./nueva-entrada-form";

describe("NuevaEntradaForm", () => {
  beforeEach(() => {
    mockAddHistorialEntryAction.mockReset();
    mockAddHistorialEntryAction.mockResolvedValue({ error: null, success: true });
  });

  it("renders the descripcion field", () => {
    render(<NuevaEntradaForm vehiculoId="v1" />);
    expect(screen.getByLabelText("Descripción")).toBeInTheDocument();
  });

  it("shows a success message after a successful submit", async () => {
    render(<NuevaEntradaForm vehiculoId="v1" />);

    await userEvent.type(screen.getByLabelText("Descripción"), "Cambio de aceite");
    await userEvent.click(screen.getByRole("button", { name: "Registrar" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Entrada registrada");
  });
});
```

- [ ] **Step 7: Run it to confirm it fails**

Run: `npx vitest run "src/app/(dashboard)/vehiculos/[id]/nueva-entrada-form.test.tsx"`
Expected: FAIL — `Cannot find module './nueva-entrada-form'`.

- [ ] **Step 8: Implement the add-entry form**

Create `src/app/(dashboard)/vehiculos/[id]/nueva-entrada-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { addHistorialEntryAction, type HistorialFormState } from "@/app/actions/historial-actions";

const initialState: HistorialFormState = { error: null, success: false };

export function NuevaEntradaForm({ vehiculoId }: { vehiculoId: string }) {
  const addEntryForVehiculo = addHistorialEntryAction.bind(null, vehiculoId);
  const [state, formAction, isPending] = useActionState(addEntryForVehiculo, initialState);

  return (
    <form action={formAction}>
      <label htmlFor="descripcion">Descripción</label>
      <textarea id="descripcion" name="descripcion" required />

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Registrar"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Entrada registrada</p> : null}
    </form>
  );
}
```

- [ ] **Step 9: Run the tests again to confirm they pass**

Run: `npx vitest run "src/app/(dashboard)/vehiculos/[id]/nueva-entrada-form.test.tsx"`
Expected: PASS — 2 tests passed.

- [ ] **Step 10: Wire the Vehiculo detail page**

Create `src/app/(dashboard)/vehiculos/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getVehiculo } from "@/app/actions/vehiculo-actions";
import { listHistorial } from "@/app/actions/historial-actions";
import { NuevaEntradaForm } from "./nueva-entrada-form";

export default async function VehiculoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vehiculo = await getVehiculo(id);

  if (!vehiculo) {
    notFound();
  }

  const historial = await listHistorial(id);

  return (
    <main>
      <h1>
        {vehiculo.placa} — {vehiculo.marca} {vehiculo.modelo}
      </h1>
      <p>Año: {vehiculo.anio ?? "—"}</p>

      <h2>Historial</h2>
      <NuevaEntradaForm vehiculoId={vehiculo.id} />
      <ul>
        {historial.map((entrada) => (
          <li key={entrada.id}>
            {new Date(entrada.fecha).toLocaleDateString()} — {entrada.descripcion}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 11: Commit**

```bash
git add src/lib/validation/historial.ts src/app/actions/historial-actions.ts src/app/actions/historial-actions.test.ts "src/app/(dashboard)/vehiculos/[id]"
git commit -m "feat: add Historial de vehiculo server actions and view"
```

---

### Task 17: End-to-end smoke test (Playwright) — login through Historial de vehículo

**Approach:** local subdomain simulation reuses the exact same `extractTenantSlug` logic as production, with no test-only branching in application code. Modern Chromium resolves any `*.localhost` hostname to `127.0.0.1` automatically (no `/etc/hosts` edit needed), so setting `BASE_DOMAIN=localhost` for the dev server (already wired into `playwright.config.ts`'s `webServer.env` in Task 3) lets a real browser navigation to `http://taller-e2e-smoke.localhost:3000/login` produce a real `Host: taller-e2e-smoke.localhost:3000` header that `middleware.ts` parses exactly as it would parse `taller-perez.zdevs.uk` in production.

**Files:**
- Create: `e2e/global-setup.ts`
- Create: `e2e/global-teardown.ts`
- Modify: `playwright.config.ts` (register `globalSetup`/`globalTeardown`)
- Create: `e2e/tenant-flow.spec.ts`

**Interfaces:**
- Consumes: `provisionTenant`, `seedTenantUser` (Task 6) in `e2e/global-setup.ts`/`global-teardown.ts`; the `/login` (Task 11), `/clientes` (Task 13), `/clientes/[id]` (Task 15), `/vehiculos/[id]` (Task 16) routes in the spec itself.
- Produces: nothing consumed by later tasks — this is the last task in the plan.

- [ ] **Step 1: Write the Playwright global setup (provisions the e2e tenant)**

Create `e2e/global-setup.ts`:

```ts
import "dotenv/config";
import { provisionTenant } from "../scripts/provision-tenant";
import { seedTenantUser } from "../scripts/seed-tenant-user";
import { publicDb } from "../src/lib/db/public-client";

export const E2E_SLUG = "taller-e2e-smoke";
export const E2E_SCHEMA = "taller_e2e_smoke";
export const E2E_ADMIN_EMAIL = "admin@e2e-smoke.test";
export const E2E_ADMIN_PASSWORD = "SmokeTest123!";

export default async function globalSetup() {
  await publicDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${E2E_SCHEMA}" CASCADE`);
  await publicDb.tenant.deleteMany({ where: { slug: E2E_SLUG } });

  await provisionTenant({ slug: E2E_SLUG, schemaName: E2E_SCHEMA });
  await seedTenantUser({
    schemaName: E2E_SCHEMA,
    email: E2E_ADMIN_EMAIL,
    password: E2E_ADMIN_PASSWORD,
    nombre: "Admin E2E",
    role: "ADMIN",
  });
}
```

- [ ] **Step 2: Write the Playwright global teardown (drops the e2e tenant)**

Create `e2e/global-teardown.ts`:

```ts
import "dotenv/config";
import { publicDb } from "../src/lib/db/public-client";
import { E2E_SLUG, E2E_SCHEMA } from "./global-setup";

export default async function globalTeardown() {
  await publicDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${E2E_SCHEMA}" CASCADE`);
  await publicDb.tenant.deleteMany({ where: { slug: E2E_SLUG } });
}
```

- [ ] **Step 3: Register global setup/teardown in the Playwright config**

Edit `playwright.config.ts` — add `globalSetup` and `globalTeardown` to the `defineConfig` object (alongside the existing `testDir`, `use`, `webServer`, `projects` from Task 3):

```ts
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
```

- [ ] **Step 4: Write the failing e2e spec**

Create `e2e/tenant-flow.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from "./global-setup";

test.use({ baseURL: "http://taller-e2e-smoke.localhost:3000" });

test("login through Historial de vehiculo, end to end", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(E2E_ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();

  await expect(page).toHaveURL(/\/clientes$/);

  await page.getByLabel("Nombre").fill("Juan Pérez");
  await page.getByRole("button", { name: "Crear cliente" }).click();
  await expect(page.getByRole("status")).toHaveText("Cliente creado");

  await page.getByRole("link", { name: "Juan Pérez" }).click();
  await expect(page.getByRole("heading", { name: "Juan Pérez" })).toBeVisible();

  await page.getByLabel("Placa").fill("ABC123");
  await page.getByLabel("Marca").fill("Toyota");
  await page.getByLabel("Modelo").fill("Corolla");
  await page.getByRole("button", { name: "Agregar vehículo" }).click();
  await expect(page.getByRole("status")).toHaveText("Vehículo agregado");

  await page.getByRole("link", { name: /ABC123/ }).click();
  await expect(page.getByRole("heading", { name: /ABC123/ })).toBeVisible();

  await page.getByLabel("Descripción").fill("Cambio de aceite y filtro");
  await page.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByRole("status")).toHaveText("Entrada registrada");
  await expect(page.getByText("Cambio de aceite y filtro")).toBeVisible();
});
```

- [ ] **Step 5: Run it to confirm it fails**

Run: `npm run test:e2e -- e2e/tenant-flow.spec.ts`
Expected: FAIL at the global setup stage before this plan is executed for real (no dev server / no seeded tenant yet is the expected failure the first time this spec is run against a fresh checkout); once Tasks 3-16 are implemented, rerun and expect it to fail only if there's a real regression in the flow — this step exists to confirm the spec is actually exercising the app (e.g., temporarily rename `page.getByLabel("Correo")` to a wrong label to see a real assertion failure) rather than trivially passing due to a typo that no-ops every assertion.

- [ ] **Step 6: Run it again for real and confirm it passes**

Run: `npm run test:e2e -- e2e/tenant-flow.spec.ts`
Expected: PASS — 1 test passed. (Requires a reachable Postgres server for `provisionTenant`/`seedTenantUser` in global setup — substitute your real `postgres.internal` host/credentials in `.env` first.)

- [ ] **Step 7: Run the full test suite one last time**

Run: `npm test && npm run test:e2e`
Expected: all Vitest unit/component tests pass, and all Playwright specs (`landing.spec.ts`, `tenant-flow.spec.ts`) pass.

- [ ] **Step 8: Commit**

```bash
git add e2e/global-setup.ts e2e/global-teardown.ts e2e/tenant-flow.spec.ts playwright.config.ts
git commit -m "test: add end-to-end smoke test covering login through Historial de vehiculo"
```

---

## Self-Review

**1. Spec coverage** — all 15 scope items map to a task:

| # | Scope item | Task |
|---|---|---|
| 3 | Testing stack (Vitest + RTL + Playwright, strict TDD) | Task 3 |
| 4 | Prisma `public` schema, `Tenant` table only | Task 4 |
| 5 | Prisma tenant schema template (`Usuario`, `Cliente`, `Vehiculo`, `HistorialVehiculo`) | Task 5 |
| 6 | Tenant provisioning + user-seeding scripts | Task 6 |
| 7 | Subdomain extraction, pure/Edge-safe | Task 7 |
| 8 | Tenant-resolution two-layer split (Edge middleware + Node `resolveTenant`) + design note | Task 8 |
| 9 | NextAuth v5 Credentials provider, tenant-scoped, JWT, 3 roles | Task 9 |
| 10 | `requireSession`/`requireRole` guards | Task 10 |
| 11 | Login page | Task 11 |
| 12 | Cliente server actions (CRUD, tenant-scoped, auth-gated) | Task 12 |
| 13 | Cliente UI (list + create) | Task 13 |
| 14 | Vehiculo server actions (CRUD, scoped to Cliente) | Task 14 |
| 15 | Cliente detail page + Vehiculo UI | Task 15 |
| 16 | Historial de vehiculo (manual log entry, server actions + view) | Task 16 |
| 17 | E2E smoke test, login through historial, full stack | Task 17 |

No gaps found.

**2. Placeholder scan** — searched every task for "TBD"/"TODO"/"implement later"/"add appropriate ..."/"similar to Task N" style shortcuts. None found; every step that changes code includes the complete code for that step. The one place a step intentionally has no code (Task 8 Step 6, "no test file for middleware.ts") is not a placeholder — it's an explicit, justified decision (middleware is a thin adapter over an already-fully-tested pure function, covered end-to-end in Task 17), stated inline.

**3. Type/name consistency across tasks** — verified by tracing every produced interface into its consuming task:
- `extractTenantSlug` (Task 7) signature `(hostHeader: string | null | undefined, baseDomain: string): string | null` matches its only call site in Task 8's `middleware.ts`.
- `TENANT_SLUG_HEADER` (Task 8) is defined once in `src/lib/tenant/constants.ts` and imported by both `middleware.ts` and `resolve-tenant.ts` — no duplicate string literal drift.
- `resolveTenant(): Promise<{ slug: string; schemaName: string } | null>` (Task 8) — the returned shape (`ResolvedTenant`) is used identically in Task 9 (`authorize()`), and Tasks 12/14/16 (`tenantDbOrThrow()` helper, repeated per action file since Server Actions can't share module-level closures across files that each need `"use server"` at the top — each file defines its own tiny `tenantDbOrThrow()` wrapping the same `resolveTenant()` + `getTenantDb()` pair).
- `getTenantDb(schemaName: string): TenantPrismaClient` (Task 5) — same signature used in Task 6 (provisioning/seeding), Task 9 (`authorize()`), Task 12/14/16 (all CRUD actions).
- `Role = "ADMIN" | "TECNICO" | "RECEPCION"` — declared once in the Prisma enum (Task 5), re-declared as a matching TS union in Task 10's `guards.ts` and Task 9's `next-auth.d.ts`; checked that all three role lists literally match (`ADMIN`, `TECNICO`, `RECEPCION`) everywhere they're spelled out (Task 9, Task 10 tests, Task 12/14/16 `requireRole([...])` calls).
- `ClienteFormState`/`VehiculoFormState`/`HistorialFormState` — each is `{ error: string | null; success: boolean }`, defined once per actions file (Task 12/14/16) and consumed by exactly the matching form component (Task 13/15/16) with matching field names (`error`, `success`) in every `state.error`/`state.success` read.
- `getCliente` (Task 12) returns `Cliente & { vehiculos: Vehiculo[] }` — Task 15's detail page reads `cliente.vehiculos` directly, matching.
- Fixed one inconsistency found during review: an earlier draft of Task 16's test asserted `requireRole(["ADMIN", "RECEPCION"])` for adding a historial entry, which didn't match the scope note that technicians log their own work — corrected to `requireRole(["ADMIN", "RECEPCION", "TECNICO"])` in both the test (Step 2) and implementation (Step 4) shown above.

No other gaps or mismatches found.
