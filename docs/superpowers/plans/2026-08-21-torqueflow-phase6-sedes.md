# TorqueFlow Fase 6 (Gestión de Sedes — multi-sede completo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the dormant `Sede` data model that Fases 2–5 built into a real multi-sede product: sedes are managed from the UI, users are assigned to sedes via a `UsuarioSede` bridge table, the sede is chosen at login, and every sede-aware read and write is scoped to that **sede activa** instead of today's "oldest sede in the tenant" fallback.

**Architecture:** One new Prisma model (`UsuarioSede`, composite-PK bridge) plus a data-backfill migration. One new session field (`sedeActivaId`, alongside `sedeActivaNombre`) that flows out of `authorize()` → JWT → session exactly the way `tenantSchema` already does. One tiny pure module, `src/lib/sede/scope.ts`, whose five functions return the Prisma `where` fragments that scope órdenes, bodegas, repuestos, entradas and facturas to a sede — every migrated call site imports from there instead of hand-writing the filter. Two new ADMIN-only surfaces (`/sedes`, `/usuarios`) built with the same plain-RSC + native-form conventions as `/bodegas` and `/proveedores`. No new npm dependency, no client state library, no `SessionProvider`.

**Tech Stack:** Next.js 16 (App Router, Server Actions, RSC), NextAuth v5 beta (Credentials provider, JWT strategy), Prisma 6.19.3 (per-tenant Postgres schema), Zod 4.4.3, Vitest, Playwright.

## Global Constraints

- Prisma pinned to exact 6.19.3 (not caret).
- Direct-to-main execution, no worktree/branch (explicit standing user consent from Fase 1 onward).
- Commit format: `fase6-task N: descripción breve` (see `RULES.md` at repo root — Fase 6 is the active phase; the message must say "fase6", not "fase5" and not a bare "task N").
- Max 1 fix/re-review loop per task (`RULES.md` #1).
- `tsc --noEmit` and full test suite only at the end of each task, not mid-development (`RULES.md` #4).
- Do not touch Fase 1–5 backlog/Minor findings while executing this phase (`RULES.md` #7) — they are listed at the end of each phase's section in `.superpowers/sdd/progress.md`; ignore them, do not fold any into this plan even if you notice related code while implementing. **Exception, explicitly in scope:** this phase's own task list legitimately rewrites files from Fases 2, 3, 4 and 5 to add sede-activa scoping. That is this phase's cross-cutting work, not backlog cleanup. The `RULES.md` #7 exclusion is about not fixing *unrelated previously-documented findings* you happen to notice — it is not about avoiding prior-phase files.
- **No `Plan` / `maxSedes` entity or enforcement anywhere — explicitly deferred to a future Fase 9 per the user's decision.** Any tenant may create any number of sedes in this phase. Do not add a plan tier field, a sede-count check, or a "límite alcanzado" message. The design doc's §9 gating and §10's still-open pricing decision are Fase 9's problem, and the roadmap line for Fase 6 mentioning "enforcement de `maxSedes`" is superseded by this decision.
- No new npm dependencies. `package.json` was checked: a native `<select>` in the login form plus server-side `where` filters need nothing that is not already installed. If you believe a dependency is genuinely required, stop and ask rather than adding one.
- **`sedeActivaId` must flow from the validated session only.** Never re-derive it inside an action from headers, cookies, a form field, or a fresh `resolveTenant()` call — that anti-pattern was deliberately removed project-wide in Fase 1 backlog #21 for `tenantSchema`, and re-introducing it for sede state would be strictly worse (sede is an authorization boundary). The single exception is the login page and `authorizeCredentials`, where by definition no session exists yet.
- **`select`-only projections on `Usuario` everywhere.** No query added by this phase may `include` a whole `Usuario` row (`passwordHash` leak class — this project has shipped that bug twice, in Fase 2's `listTecnicos` and Fase 3's `listRepuestoOptions`).
- A `"use server"` module may only export async functions and types. Do not export a shared constant or a synchronous helper from any `*-actions.ts` file — Next.js rejects it at build time. Pure helpers live in `src/lib/`.
- Every required-string `formData.get(...)` must be written `formData.get("campo") ?? ""`. With a bare `null`, Zod 4.4.3 emits its generic type error instead of the custom Spanish message. This has bitten the project in Fase 1 and Fase 3 — see the Fase 3 Task 3 ledger entry.

### Phase-specific decisions (established during investigation, binding for every task)

**Login-flow design: the sede is a third field inside the single login form, not a second post-authentication step.**

The tenant is already resolved from the subdomain by the Edge middleware (Fase 1) before any login attempt, and `src/app/login/page.tsx` is a React Server Component. It can therefore call `resolveTenant()` and list that tenant's sedes *before knowing who is logging in*, and render them as a `<select>` next to Correo and Contraseña. `signIn("credentials", { email, password, sedeId, redirect: false })` carries the choice into `authorize()`, which validates it server-side against `UsuarioSede` (ADMIN bypasses the check) and rejects the whole login if the user is not entitled to that sede. A two-step flow would need to hold a half-authenticated identity between the credential check and the sede choice — NextAuth's Credentials provider has no first-class support for that, so it would mean a bespoke short-lived token or intermediate cookie, a new route, and a new attack surface, in exchange for no benefit at the 1–5-sede scale this product targets. One step wins.

**Accepted tradeoff of that choice:** the login page discloses the tenant's sede *names* to any unauthenticated visitor who can reach the subdomain. Sede names are branch labels ("Sede norte"), not secrets, and the same visitor already learns the tenant exists from the subdomain resolving at all. This is a deliberate, documented tradeoff, not an oversight.

**Login failure messaging is deliberately uniform.** A wrong password, an unknown email, and "you are not assigned to that sede" all produce the same message, `"Correo, contraseña o sede incorrectos"`. `authorize()` returns `null` in all three cases. This prevents enumerating both accounts and sede assignments, and it keeps the existing single-error-path shape of `LoginForm`.

**Session field names: `sedeActivaId` and `sedeActivaNombre`.** Both are non-optional `string` on `Session["user"]` and on the `User` returned by `authorize()`, and optional on `JWT` (mirroring how `tenantSchema` is declared today in `src/types/next-auth.d.ts`). `sedeActivaNombre` exists purely so the dashboard header can display the active sede without a database round-trip on every page.

**Role gate for managing Sedes and UsuarioSede assignments: `requireRole(["ADMIN"])`, both.** A sede is the structural boundary that partitions the tenant's operational data, and a `UsuarioSede` row *is* an authorization grant. If `RECEPCION` could create a sede or assign itself to one, the entire scoping boundary this phase builds would be self-serve. This follows the project's established "structurally or financially sensitive ⇒ ADMIN-only" precedent from Fase 5's reportes. Note this is deliberately *stricter* than `bodega`/`proveedor`/`repuesto` CRUD, which stay `["ADMIN", "RECEPCION"]` and are not changed by this phase.

**ADMIN sees and operates across all sedes; TECNICO and RECEPCION are confined to their assigned sedes.** This is the design doc's own rule (§5 módulo 12: "roles de técnico/recepción quedan acotados a sus sedes asignadas, el admin del taller ve todas"). Concretely: an ADMIN may select *any* sede of the tenant at login with no `UsuarioSede` row; a TECNICO/RECEPCION may only select a sede they have a row for. **Crucially, "ADMIN sees all sedes" means "ADMIN may switch to any sede", not "ADMIN's queries ignore the sede filter".** Once logged in, an ADMIN's `sedeActivaId` scopes their órdenes, bodegas, repuestos and facturas exactly like anyone else's. The only place an ADMIN reads across sedes is `/reportes`, where an explicit sede selector lets them compare — that is the design doc's "el dashboard de rentabilidad suma sede como dimensión de filtro/comparación".

**Switching sede without re-login is OUT of scope for this phase, deliberately.** The clean way to mutate a live JWT in NextAuth v5 is the `jwt` callback's `update` trigger driven by `useSession().update()`. This app has no `<SessionProvider>` (it only imports `signIn`/`signOut` from `next-auth/react`, which work without one), so that route means introducing the app's first session provider and first client-side session hook, plus re-validating client-supplied data inside the `jwt` callback — new auth machinery in the same phase that first establishes the sede boundary. The v1 answer is re-login, made painless by a "Cambiar de sede" button in the dashboard header that signs out and returns to `/login` (Task 18), reusing the existing `SignOutButton` mechanics and Fase 5's `resolveRedirectUrl` fix verbatim. Revisit in a later phase if real users complain.

**Transferencias de inventario entre sedes: OUT of scope for this phase, with the specific blocker stated below.** The user left this conditional ("si aplica"). It does not apply, and here is the evidence from the real schema rather than a judgement call:

- `Repuesto.codigo` is `String @unique` — unique across the *entire tenant schema*, not per bodega. The same part number therefore cannot exist as two rows in two bodegas.
- Stock is a scalar on the `Repuesto` row (`stockActual Int`), and `Repuesto.bodegaId` is a required single FK. A bodega belongs to exactly one sede (`Bodega.sedeId`, required).
- Consequently "move 5 units of FRN-001 from Sede A to Sede B" has **no representable destination**: there is no second `Repuesto` row in Sede B's bodega to increment, and the unique constraint forbids creating one.
- The only operation the current model can express is `repuesto.bodegaId = otraBodega`, which moves the whole catalog row and its entire stock at once. That silently re-homes its `EntradaMercancia` history (entries were recorded against the old bodega), breaks `addEntradaItemAction`'s `repuesto.bodegaId !== entrada.bodegaId` invariant for every historical row, and would let `crearFacturaAction` decrement stock that now lives in a different sede than the orden being invoiced. That is not a transfer feature; it is a data-integrity hazard wearing one's coat.

**What would be needed instead, if the user wants it as its own phase:** (1) relax `Repuesto.codigo @unique` to `@@unique([codigo, bodegaId])`, with a data migration and an audit of every `codigo`-based lookup; (2) new `TransferenciaInventario` / `TransferenciaInventarioItem` models with origin and destination bodega FKs; (3) a product decision on in-transit state — does stock leave the origin immediately on dispatch, or only on confirmed receipt? (Two-step is correct for real shops but doubles the state machine.); (4) an atomic `$transaction` mirroring `crearFacturaAction`'s `updateMany({ where: { stockActual: { gte: cantidad } } })` floor check on the origin side. That is a phase, not a task, and (3) is an unresolved design decision that must be answered before any of it can be planned. **Fase 6 does make inventory sede-aware for reads and writes (Tasks 13–15) — a user only ever sees and touches their sede activa's bodegas and repuestos. Moving stock between sedes remains a manual, out-of-system operation for now.**

**`Cita` does not exist yet.** The design doc's §5 módulo 12 lists `Cita.sedeId` as part of the target model, but `prisma/tenant/schema.prisma` has no `Cita` model — appointments are Fase 7. Do not reference, create, or scope a `Cita` anywhere in this phase.

**Clientes, vehículos, historial and proveedores stay tenant-wide, not sede-scoped.** The design doc is explicit: "Clientes y vehículos siguen compartidos a nivel de tenant (un cliente puede llevar su vehículo a cualquier sede del mismo taller)." `Proveedor` has no `sedeId` column and is a shared purchasing catalog. Do not add scoping to `cliente-actions.ts`, `vehiculo-actions.ts`, `historial-actions.ts`, or `proveedor-actions.ts`. This is a decision, not an omission — if a reviewer flags it, point at this paragraph.

**`Sede.usuarios` is `onDelete: Restrict`; `Usuario.sedes` is `onDelete: Cascade`.** Justified in Task 1, and consistent with the project's existing rule of thumb: `Restrict` where deletion would destroy operational or audit meaning (`Bodega.sede`, `OrdenTrabajo.sede`, `Factura.orden` are all already `Restrict`), `Cascade` for rows that are meaningless without their owner (`DviFoto.dvi`, `ItemOrden.orden`).

**The migration must backfill existing users.** A tenant already in production has `Usuario` rows and zero `UsuarioSede` rows. The instant the login gate starts requiring an assignment, every non-ADMIN user in every existing tenant is locked out. Task 1's migration therefore ships a backfill `INSERT ... SELECT` that grants every existing `Usuario` the tenant's oldest `Sede`. This is not optional polish; skipping it is a production outage.

---

## File Structure

**New files**

| Path | Responsibility |
| --- | --- |
| `src/lib/sede/scope.ts` | Five pure functions returning the Prisma `where` fragment that confines a query to one sede. The single source of truth for "what does sede-scoped mean" for each entity. |
| `src/lib/sede/scope.test.ts` | Unit tests for the above. |
| `src/lib/sede/login-sedes.ts` | `listSedesDelTenant(schemaName)` — the only sede read that runs without a session, used by the login page. |
| `src/lib/sede/login-sedes.test.ts` | Unit tests for the above. |
| `src/lib/auth/sede-access.ts` | `resolveSedeActiva(tenantDb, usuarioId, role, sedeId)` — the authorization decision "may this user work in this sede?", returning the sede's id + nombre or `null`. |
| `src/lib/auth/sede-access.test.ts` | Unit tests for the above, including the ADMIN bypass. |
| `src/lib/validation/sede.ts` | `sedeInputSchema` (nombre, direccion) and `usuarioSedesInputSchema` (sedeIds array). |
| `src/lib/validation/sede.test.ts` | Unit tests for the above. |
| `src/app/actions/sede-actions.ts` | ADMIN-only Sede CRUD server actions. |
| `src/app/actions/sede-actions.test.ts` | Unit tests for the above. |
| `src/app/actions/usuario-actions.ts` | ADMIN-only user listing + sede-assignment server actions. |
| `src/app/actions/usuario-actions.test.ts` | Unit tests for the above. |
| `src/app/(dashboard)/sedes/page.tsx` | RSC list page for sedes. |
| `src/app/(dashboard)/sedes/nueva-sede-form.tsx` | Client form for creating a sede. |
| `src/app/(dashboard)/sedes/nueva-sede-form.test.tsx` | Component test for the above. |
| `src/app/(dashboard)/sedes/editar-sede-form.tsx` | Client form for renaming/deleting one sede. |
| `src/app/(dashboard)/usuarios/page.tsx` | RSC list page for users + their sede assignments. |
| `src/app/(dashboard)/usuarios/asignar-sedes-form.tsx` | Client form (checkbox set) for one user's sede assignments. |
| `src/app/(dashboard)/usuarios/asignar-sedes-form.test.tsx` | Component test for the above. |
| `src/app/(dashboard)/cambiar-sede-button.tsx` | Header affordance: sign out and return to `/login` to pick another sede. |
| `prisma/tenant/migrations/<timestamp>_add_usuario_sede/migration.sql` | The bridge table plus the backfill. |

**Modified files**

| Path | Change |
| --- | --- |
| `prisma/tenant/schema.prisma` | `UsuarioSede` model + back-relations on `Usuario` and `Sede`. |
| `scripts/provision-tenant.ts` | Nothing (no users exist at provisioning time) — verified in Task 2, documented there. |
| `scripts/seed-tenant-user.ts` | Also grant the seeded user the tenant's oldest sede. |
| `src/types/next-auth.d.ts` | `sedeActivaId` / `sedeActivaNombre` on `User`, `Session["user"]`, `JWT`. |
| `src/auth.ts` | Declare the `sedeId` credential; copy the two new fields through the `jwt` and `session` callbacks. |
| `src/lib/auth/authorize-credentials.ts` | Read + validate `sedeId`, return the two new fields. |
| `src/app/login/page.tsx` | Fetch the tenant's sedes and pass them to the form. |
| `src/app/login/login-form.tsx` | Sede `<select>`; send `sedeId` to `signIn`; new error copy. |
| `src/app/actions/orden-actions.ts` | Sede-scope every read and the create. |
| `src/app/actions/item-orden-actions.ts`, `mano-de-obra-actions.ts`, `dvi-actions.ts` | Sede-scope the orden lookup that gates each mutation. |
| `src/app/actions/bodega-actions.ts` | Sede-scope reads; create against the sede activa; scope update/delete. |
| `src/app/actions/repuesto-actions.ts` | Sede-scope reads; validate `bodegaId` belongs to the sede activa. |
| `src/app/actions/entrada-mercancia-actions.ts` | Same. |
| `src/app/actions/factura-actions.ts`, `pago-actions.ts` | Sede-scope through the orden relation. |
| `src/app/actions/reporte-actions.ts` | Drop the oldest-sede fallback; default to `sedeActivaId`; allow an explicit sede for comparison. |
| `src/app/(dashboard)/reportes/page.tsx` | Replace the hidden `sedeId` input with a real selector. |
| `src/app/(dashboard)/layout.tsx` | Show the sede activa; add ADMIN-only `/sedes` and `/usuarios` links; add the "Cambiar de sede" button. |
| `e2e/global-setup.ts`, `e2e/tenant-flow.spec.ts` | Sede selection at login + the cross-sede isolation proof. |

---
### Task 1: `UsuarioSede` bridge table + backfill migration

**Files:**
- Modify: `prisma/tenant/schema.prisma` (`Usuario` model, `Sede` model, new `UsuarioSede` model)
- Create: `prisma/tenant/migrations/<timestamp>_add_usuario_sede/migration.sql` (generated, then hand-edited)
- Modify: `scripts/provision-tenant.test.ts` (add the backfill regression test)

**Interfaces:**
- Consumes: nothing.
- Produces: the Prisma delegate `tenantDb.usuarioSede` with `{ usuarioId: string; sedeId: string; createdAt: Date }`, composite primary key `@@id([usuarioId, sedeId])` (client lookup key `usuarioId_sedeId`), the relation `Usuario.sedes: UsuarioSede[]`, and the relation `Sede.usuarios: UsuarioSede[]`. Every later task depends on these exact names.

**Cascade decisions, to state in the review:**
- `usuario` side is `onDelete: Cascade`. A `UsuarioSede` row is an authorization grant with no audit or financial meaning of its own; once the `Usuario` is gone the grant is noise. Same shape as `DviFoto → Dvi` and `ItemOrden → OrdenTrabajo`. (Contrast with `HistorialVehiculo.autor`, which is `SetNull` because the *history entry* must survive the author — there is no equivalent surviving artifact here.)
- `sede` side is `onDelete: Restrict`, matching `Bodega.sede` and `OrdenTrabajo.sede`. Deleting a sede that still has people assigned to it must fail loudly so the admin reassigns them first; a silent `Cascade` would revoke access with no trace. Task 7's `deleteSedeAction` pre-checks this and returns a readable Spanish message instead of letting the raw FK error surface.

- [ ] **Step 1: Write the failing test**

Append to `scripts/provision-tenant.test.ts`, inside the existing top-level `describe("provisionTenant", ...)` block (it already imports `publicDb`, `getTenantDb` and `provisionTenant`, and already has an `afterEach(dropTestSchema)`):

```ts
  it("exposes the usuarioSede bridge table on a freshly provisioned tenant", async () => {
    await provisionTenant({ slug: SLUG, schemaName: SCHEMA });

    const tenantDb = getTenantDb(SCHEMA);

    // The table exists and is empty: provisionTenant creates no Usuario rows,
    // so there is nothing to grant yet (seedTenantUser does that -- Task 2).
    await expect(tenantDb.usuarioSede.count()).resolves.toBe(0);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/provision-tenant.test.ts`
Expected: FAIL — TypeScript/runtime error, `tenantDb.usuarioSede` is `undefined` (the model does not exist yet).

- [ ] **Step 3: Add the model to the schema**

In `prisma/tenant/schema.prisma`, add one line to the `Usuario` model, right after `pagosRegistrados  Pago[]`:

```prisma
  sedes             UsuarioSede[]
```

Add one line to the `Sede` model, right after `bodegas   Bodega[]`:

```prisma
  usuarios  UsuarioSede[]
```

And add the new model immediately after the `Sede` model:

```prisma
/// Bridge table: which sedes a Usuario may work in. ADMIN bypasses this table
/// entirely (see src/lib/auth/sede-access.ts) -- rows here only ever matter for
/// TECNICO and RECEPCION. Composite PK, so the same grant can never be
/// duplicated and no surrogate id is needed.
model UsuarioSede {
  usuarioId String   @map("usuario_id")
  usuario   Usuario  @relation(fields: [usuarioId], references: [id], onDelete: Cascade)
  sedeId    String   @map("sede_id")
  sede      Sede     @relation(fields: [sedeId], references: [id], onDelete: Restrict)
  createdAt DateTime @default(now()) @map("created_at")

  @@id([usuarioId, sedeId])
  @@map("usuario_sedes")
  @@index([sedeId])
}
```

- [ ] **Step 4: Generate the migration without applying it**

Run: `npx prisma migrate dev --create-only --name add_usuario_sede --schema=prisma/tenant/schema.prisma`
Expected: a new folder `prisma/tenant/migrations/<timestamp>_add_usuario_sede/` containing `migration.sql`, and the message `You can now edit it and apply it`. Nothing is applied to the database yet.

Verify the generated `migration.sql` matches this (Prisma emits it in this order; the exact timestamp in the folder name will differ):

```sql
-- CreateTable
CREATE TABLE "usuario_sedes" (
    "usuario_id" TEXT NOT NULL,
    "sede_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_sedes_pkey" PRIMARY KEY ("usuario_id","sede_id")
);

-- CreateIndex
CREATE INDEX "usuario_sedes_sede_id_idx" ON "usuario_sedes"("sede_id");

-- AddForeignKey
ALTER TABLE "usuario_sedes" ADD CONSTRAINT "usuario_sedes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_sedes" ADD CONSTRAINT "usuario_sedes_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

If the `ON DELETE` clauses differ from `CASCADE` (usuario) and `RESTRICT` (sede), the schema edit in Step 3 is wrong — fix the schema and regenerate rather than hand-patching the SQL.

- [ ] **Step 5: Append the backfill to the same migration file**

Add this to the **end** of the generated `migration.sql`, below the two `AddForeignKey` statements:

```sql
-- Backfill: grant every pre-existing Usuario the tenant's oldest Sede.
-- Without this, the login sede gate introduced in Fase 6 Task 6 locks every
-- existing TECNICO/RECEPCION out of every already-provisioned tenant, because
-- they have no UsuarioSede row. The oldest sede is the "Sede principal" that
-- provisionTenant has created since Fase 2, i.e. the sede those users have
-- implicitly been working in all along. On a freshly provisioned schema both
-- tables are empty and this inserts zero rows.
INSERT INTO "usuario_sedes" ("usuario_id", "sede_id", "created_at")
SELECT u."id", s."id", CURRENT_TIMESTAMP
FROM "usuarios" u
CROSS JOIN (
    SELECT "id" FROM "sedes" ORDER BY "created_at" ASC LIMIT 1
) s;
```

- [ ] **Step 6: Apply the migration and regenerate the client**

Run: `npx prisma migrate dev --schema=prisma/tenant/schema.prisma`
Expected: `Applying migration \`<timestamp>_add_usuario_sede\`` followed by `Generated Prisma Client`. If your local `TENANT_DATABASE_URL` points at a schema that has no rows, the backfill reports zero inserted — that is correct.

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run scripts/provision-tenant.test.ts`
Expected: PASS — the pre-existing provisioning tests plus the new `usuarioSede` one.

- [ ] **Step 8: Full verification pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; the full unit suite green (299 pre-existing tests plus the one added here).

Per `RULES.md` #1, if either command fails, make at most one correction attempt, then stop and report.

- [ ] **Step 9: Commit**

```bash
git add prisma/tenant/schema.prisma prisma/tenant/migrations scripts/provision-tenant.test.ts src/generated
git commit -m "fase6-task 1: add UsuarioSede bridge table with backfill migration"
git push origin main
```

If `src/generated` is gitignored in this repo, drop it from the `git add` — check `git status` before committing rather than forcing it.

---

### Task 2: `seedTenantUser` grants the new user the tenant's oldest sede

`provisionTenant` creates the default `Sede` but **no users at all** — verified by reading `scripts/provision-tenant.ts`, which only calls `sede.create` and `bodega.create`. Users are created exclusively by `seedTenantUser`. So the "a freshly provisioned tenant's admin can log in on day one" requirement belongs in `seedTenantUser`, not in `provisionTenant`, and `provision-tenant.ts` needs no change in this phase.

**Files:**
- Modify: `scripts/seed-tenant-user.ts`
- Modify: `scripts/seed-tenant-user.test.ts`

**Interfaces:**
- Consumes: `tenantDb.usuarioSede` and the `usuarioId_sedeId` composite key from Task 1.
- Produces: `seedTenantUser` keeps its existing signature — `seedTenantUser({ schemaName, email, password, nombre, role? }): Promise<Usuario>` — and additionally guarantees the returned user has at least one `UsuarioSede` row when the tenant has at least one `Sede`.

- [ ] **Step 1: Write the failing test**

Append to `scripts/seed-tenant-user.test.ts`. Read the file first: it already provisions a real tenant schema in a `beforeAll`/`afterAll` and imports `getTenantDb`. Reuse whatever schema constant it already defines rather than introducing a second one — the snippet below assumes it is named `SCHEMA`; adjust to the file's actual constant name if it differs.

```ts
  it("assigns the seeded user to the tenant's oldest sede", async () => {
    const usuario = await seedTenantUser({
      schemaName: SCHEMA,
      email: "sede-grant@example.test",
      password: "SuperSecret123!",
      nombre: "Con Sede",
      role: "TECNICO",
    });

    const tenantDb = getTenantDb(SCHEMA);
    const sedeMasAntigua = await tenantDb.sede.findFirst({ orderBy: { createdAt: "asc" } });
    const grants = await tenantDb.usuarioSede.findMany({ where: { usuarioId: usuario.id } });

    expect(grants).toHaveLength(1);
    expect(grants[0].sedeId).toBe(sedeMasAntigua?.id);
  });

  it("is idempotent: re-seeding the same email does not duplicate the sede grant", async () => {
    const first = await seedTenantUser({
      schemaName: SCHEMA,
      email: "sede-idempotente@example.test",
      password: "SuperSecret123!",
      nombre: "Repetido",
    });
    const second = await seedTenantUser({
      schemaName: SCHEMA,
      email: "sede-idempotente@example.test",
      password: "OtraClave456!",
      nombre: "Repetido",
    });

    expect(second.id).toBe(first.id);

    const tenantDb = getTenantDb(SCHEMA);
    const grants = await tenantDb.usuarioSede.findMany({ where: { usuarioId: first.id } });
    expect(grants).toHaveLength(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/seed-tenant-user.test.ts`
Expected: FAIL — `expected [] to have a length of 1 but got 0`.

- [ ] **Step 3: Implement the grant**

Replace the body of `seedTenantUser` in `scripts/seed-tenant-user.ts` (keep the imports and the `SeedTenantUserInput` interface exactly as they are):

```ts
export async function seedTenantUser({
  schemaName,
  email,
  password,
  nombre,
  role = "ADMIN",
}: SeedTenantUserInput): Promise<Usuario> {
  const tenantDb = getTenantDb(schemaName);
  const passwordHash = await bcrypt.hash(password, 12);

  const usuario = await tenantDb.usuario.upsert({
    where: { email },
    update: { passwordHash, nombre, role },
    create: { email, passwordHash, nombre, role },
  });

  // Day-one login: a TECNICO/RECEPCION with no UsuarioSede row cannot pass the
  // sede gate in authorizeCredentials, so every seeded user is granted the
  // tenant's oldest sede -- the "Sede principal" provisionTenant creates. An
  // ADMIN does not strictly need the row (it bypasses the check), but having
  // it keeps /usuarios honest about who works where. upsert makes re-seeding
  // the same email idempotent.
  const sede = await tenantDb.sede.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (sede) {
    await tenantDb.usuarioSede.upsert({
      where: { usuarioId_sedeId: { usuarioId: usuario.id, sedeId: sede.id } },
      update: {},
      create: { usuarioId: usuario.id, sedeId: sede.id },
    });
  }

  return usuario;
}
```

Note the `if (sede)` guard: `seedTenantUser` is a standalone CLI that can be pointed at any schema, including one whose sedes were deleted. Seeding a user with no sede must not throw — it just produces a user who cannot log in until an ADMIN assigns them one at `/usuarios` (Task 10).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run scripts/seed-tenant-user.test.ts`
Expected: PASS — the pre-existing tests plus the two new ones.

- [ ] **Step 5: Full verification pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full unit suite green.

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-tenant-user.ts scripts/seed-tenant-user.test.ts
git commit -m "fase6-task 2: seedTenantUser grants the default sede via UsuarioSede"
git push origin main
```

---

### Task 3: `src/lib/sede/scope.ts` — the sede-scoping `where` fragments

Five one-line pure functions. They exist so that "what does it mean for this entity to belong to a sede" is written down exactly once, and so a reviewer auditing the data-isolation boundary has a single file to read instead of twelve action files. Tasks 11–17 import from here and must never hand-write the equivalent object literal.

**Files:**
- Create: `src/lib/sede/scope.ts`
- Create: `src/lib/sede/scope.test.ts`

**Interfaces:**
- Consumes: nothing (no Prisma import — these are plain object literals, which is exactly why they are trivially testable).
- Produces:
  - `scopeOrden(sedeActivaId: string): { sedeId: string }`
  - `scopeBodega(sedeActivaId: string): { sedeId: string }`
  - `scopeRepuesto(sedeActivaId: string): { bodega: { sedeId: string } }`
  - `scopeEntrada(sedeActivaId: string): { bodega: { sedeId: string } }`
  - `scopeFactura(sedeActivaId: string): { orden: { sedeId: string } }`

- [ ] **Step 1: Write the failing test**

Create `src/lib/sede/scope.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { scopeBodega, scopeEntrada, scopeFactura, scopeOrden, scopeRepuesto } from "./scope";

describe("sede scope filters", () => {
  it("scopes órdenes on their own sedeId column", () => {
    expect(scopeOrden("sede-1")).toEqual({ sedeId: "sede-1" });
  });

  it("scopes bodegas on their own sedeId column", () => {
    expect(scopeBodega("sede-1")).toEqual({ sedeId: "sede-1" });
  });

  it("scopes repuestos through their bodega, which owns the sedeId", () => {
    expect(scopeRepuesto("sede-1")).toEqual({ bodega: { sedeId: "sede-1" } });
  });

  it("scopes entradas de mercancía through their bodega", () => {
    expect(scopeEntrada("sede-1")).toEqual({ bodega: { sedeId: "sede-1" } });
  });

  it("scopes facturas through their orden, since Factura has no sede_id column", () => {
    expect(scopeFactura("sede-1")).toEqual({ orden: { sedeId: "sede-1" } });
  });

  it("returns a fresh object each call so callers can safely spread and mutate", () => {
    const a = scopeOrden("sede-1");
    const b = scopeOrden("sede-1");
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sede/scope.test.ts`
Expected: FAIL — `Failed to resolve import "./scope"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/sede/scope.ts`:

```ts
/**
 * The single definition of "belongs to this sede" for every sede-aware entity.
 * Each function returns a Prisma `where` fragment meant to be spread into a
 * larger filter:
 *
 *     tenantDb.ordenTrabajo.findFirst({ where: { id, ...scopeOrden(sedeActivaId) } })
 *
 * Spreading into `findFirst` (never `findUnique`) is the point: `findUnique`
 * accepts only unique columns, so an id-only lookup silently reaches across
 * sedes. Every "get one by id" in a sede-aware module must be a `findFirst`
 * carrying one of these fragments, or it is an IDOR across the sede boundary.
 *
 * Deliberately Prisma-type-free: plain object literals, so this module is
 * unit-testable without a database and a reviewer can audit the whole
 * isolation boundary in one screen.
 */

/** OrdenTrabajo.sedeId is a required, indexed column. */
export function scopeOrden(sedeActivaId: string): { sedeId: string } {
  return { sedeId: sedeActivaId };
}

/** Bodega.sedeId is a required, indexed column. */
export function scopeBodega(sedeActivaId: string): { sedeId: string } {
  return { sedeId: sedeActivaId };
}

/** Repuesto has no sede_id; it inherits one through its required Bodega. */
export function scopeRepuesto(sedeActivaId: string): { bodega: { sedeId: string } } {
  return { bodega: { sedeId: sedeActivaId } };
}

/** EntradaMercancia has no sede_id; it inherits one through its required Bodega. */
export function scopeEntrada(sedeActivaId: string): { bodega: { sedeId: string } } {
  return { bodega: { sedeId: sedeActivaId } };
}

/** Factura has no sede_id; it inherits one through its required OrdenTrabajo. */
export function scopeFactura(sedeActivaId: string): { orden: { sedeId: string } } {
  return { orden: { sedeId: sedeActivaId } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/sede/scope.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sede/scope.ts src/lib/sede/scope.test.ts
git commit -m "fase6-task 3: add pure sede scope filters"
git push origin main
```

---
### Task 4: `resolveSedeActiva` — the "may this user work in this sede?" decision

**Files:**
- Create: `src/lib/auth/sede-access.ts`
- Create: `src/lib/auth/sede-access.test.ts`

**Interfaces:**
- Consumes: `tenantDb.usuarioSede` and `tenantDb.sede` from Task 1; the `TenantPrismaClient` type from `@/lib/db/tenant-client`.
- Produces:
  - `interface SedeActiva { id: string; nombre: string }`
  - `resolveSedeActiva(tenantDb: TenantPrismaClient, usuarioId: string, role: Role, sedeId: string): Promise<SedeActiva | null>` — used by Task 6's `authorizeCredentials`.

It takes `tenantDb` as its first parameter rather than resolving one itself, exactly like the existing `verifyCredentials(tenantDb, email, password)` — that is what makes it unit-testable against a plain object mock.

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/sede-access.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveSedeActiva } from "./sede-access";
import type { TenantPrismaClient } from "@/lib/db/tenant-client";

const mockSedeFindUnique = vi.fn();
const mockUsuarioSedeFindUnique = vi.fn();

const tenantDb = {
  sede: { findUnique: mockSedeFindUnique },
  usuarioSede: { findUnique: mockUsuarioSedeFindUnique },
} as unknown as TenantPrismaClient;

describe("resolveSedeActiva", () => {
  beforeEach(() => {
    mockSedeFindUnique.mockReset().mockResolvedValue({ id: "sede-1", nombre: "Sede principal" });
    mockUsuarioSedeFindUnique.mockReset().mockResolvedValue(null);
  });

  it("returns null without touching the database when sedeId is empty", async () => {
    const result = await resolveSedeActiva(tenantDb, "u1", "ADMIN", "");

    expect(result).toBeNull();
    expect(mockSedeFindUnique).not.toHaveBeenCalled();
  });

  it("returns null when the sede does not exist in this tenant", async () => {
    mockSedeFindUnique.mockResolvedValue(null);

    const result = await resolveSedeActiva(tenantDb, "u1", "ADMIN", "sede-fantasma");

    expect(result).toBeNull();
    expect(mockUsuarioSedeFindUnique).not.toHaveBeenCalled();
  });

  it("lets an ADMIN into any sede of the tenant without a UsuarioSede row", async () => {
    const result = await resolveSedeActiva(tenantDb, "u1", "ADMIN", "sede-1");

    expect(result).toEqual({ id: "sede-1", nombre: "Sede principal" });
    expect(mockUsuarioSedeFindUnique).not.toHaveBeenCalled();
  });

  it("lets a TECNICO into a sede they are assigned to", async () => {
    mockUsuarioSedeFindUnique.mockResolvedValue({ usuarioId: "u1", sedeId: "sede-1" });

    const result = await resolveSedeActiva(tenantDb, "u1", "TECNICO", "sede-1");

    expect(result).toEqual({ id: "sede-1", nombre: "Sede principal" });
    expect(mockUsuarioSedeFindUnique).toHaveBeenCalledWith({
      where: { usuarioId_sedeId: { usuarioId: "u1", sedeId: "sede-1" } },
      select: { sedeId: true },
    });
  });

  it("refuses a TECNICO who has no assignment for that sede", async () => {
    mockUsuarioSedeFindUnique.mockResolvedValue(null);

    const result = await resolveSedeActiva(tenantDb, "u1", "TECNICO", "sede-1");

    expect(result).toBeNull();
  });

  it("refuses a RECEPCION who has no assignment for that sede", async () => {
    mockUsuarioSedeFindUnique.mockResolvedValue(null);

    const result = await resolveSedeActiva(tenantDb, "u1", "RECEPCION", "sede-1");

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/auth/sede-access.test.ts`
Expected: FAIL — `Failed to resolve import "./sede-access"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/auth/sede-access.ts`:

```ts
import type { TenantPrismaClient } from "@/lib/db/tenant-client";
import type { Role } from "@/lib/auth/guards";

export interface SedeActiva {
  id: string;
  nombre: string;
}

/**
 * Decides whether `usuarioId` may work in `sedeId`, and returns the sede's
 * id + nombre so the caller can put both in the session (the nombre is what
 * the dashboard header renders, avoiding a query on every page).
 *
 * ADMIN bypasses UsuarioSede entirely -- that is the design doc's own rule
 * (§5 módulo 12: "el admin del taller ve todas"). It is a bypass of the
 * *assignment* check only: the sede must still exist in this tenant, and once
 * chosen it scopes the ADMIN's queries exactly like anyone else's.
 *
 * Returns null for every failure mode -- unknown sede, no assignment, empty
 * input -- so the caller cannot accidentally distinguish them and leak whether
 * a given sede exists or who is assigned where.
 */
export async function resolveSedeActiva(
  tenantDb: TenantPrismaClient,
  usuarioId: string,
  role: Role,
  sedeId: string,
): Promise<SedeActiva | null> {
  if (!sedeId) return null;

  const sede = await tenantDb.sede.findUnique({
    where: { id: sedeId },
    select: { id: true, nombre: true },
  });
  if (!sede) return null;

  if (role === "ADMIN") {
    return { id: sede.id, nombre: sede.nombre };
  }

  const asignacion = await tenantDb.usuarioSede.findUnique({
    where: { usuarioId_sedeId: { usuarioId, sedeId } },
    select: { sedeId: true },
  });
  if (!asignacion) return null;

  return { id: sede.id, nombre: sede.nombre };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/auth/sede-access.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Full verification pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full unit suite green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/sede-access.ts src/lib/auth/sede-access.test.ts
git commit -m "fase6-task 4: add resolveSedeActiva with ADMIN bypass"
git push origin main
```

---

### Task 5: Carry `sedeActivaId` / `sedeActivaNombre` through the session

Pure plumbing, mirroring how `tenantSchema` already travels. `authorize()` does not populate the new fields yet (Task 6 does) — this task only makes the types and the callbacks ready, and pins the callback behavior with tests so a later regression is caught.

**Files:**
- Modify: `src/types/next-auth.d.ts`
- Modify: `src/auth.ts`
- Create: `src/auth.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `session.user.sedeActivaId: string` and `session.user.sedeActivaNombre: string`, available to every `requireSession()` / `requireRole()` caller from Task 13 onward. Also declares `sedeId` as a Credentials field so the login form may post it.

- [ ] **Step 1: Write the failing test**

Create `src/auth.test.ts`. `src/auth.ts` calls `NextAuth(...)` at module scope, so the test mocks `next-auth` to capture the config object instead of booting the real thing:

```ts
import { describe, expect, it, vi } from "vitest";

const capturedConfig: { current: Record<string, never> | null } = { current: null };

vi.mock("next-auth", () => ({
  default: (config: Record<string, never>) => {
    capturedConfig.current = config;
    return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() };
  },
}));

vi.mock("next-auth/providers/credentials", () => ({
  default: (config: Record<string, never>) => ({ id: "credentials", ...config }),
}));

vi.mock("@/lib/auth/authorize-credentials", () => ({ authorizeCredentials: vi.fn() }));

import "./auth";

/* eslint-disable @typescript-eslint/no-explicit-any */
function config(): any {
  if (!capturedConfig.current) throw new Error("NextAuth config was not captured");
  return capturedConfig.current;
}

describe("auth callbacks", () => {
  it("declares a sedeId credential alongside email and password", () => {
    const provider = config().providers[0];

    expect(Object.keys(provider.credentials)).toEqual(["email", "password", "sedeId"]);
  });

  it("copies sedeActivaId and sedeActivaNombre from the user onto the token on sign-in", async () => {
    const token = await config().callbacks.jwt({
      token: {},
      user: {
        role: "TECNICO",
        tenantSlug: "taller-perez",
        tenantSchema: "taller_perez",
        sedeActivaId: "sede-1",
        sedeActivaNombre: "Sede principal",
      },
    });

    expect(token.sedeActivaId).toBe("sede-1");
    expect(token.sedeActivaNombre).toBe("Sede principal");
  });

  it("leaves an existing token untouched on subsequent requests (no user)", async () => {
    const token = await config().callbacks.jwt({
      token: { sedeActivaId: "sede-1", sedeActivaNombre: "Sede principal" },
      user: undefined,
    });

    expect(token.sedeActivaId).toBe("sede-1");
    expect(token.sedeActivaNombre).toBe("Sede principal");
  });

  it("exposes both sede fields on the session", async () => {
    const session = await config().callbacks.session({
      session: { user: {} },
      token: {
        sub: "u1",
        role: "TECNICO",
        tenantSlug: "taller-perez",
        tenantSchema: "taller_perez",
        sedeActivaId: "sede-1",
        sedeActivaNombre: "Sede principal",
      },
    });

    expect(session.user.sedeActivaId).toBe("sede-1");
    expect(session.user.sedeActivaNombre).toBe("Sede principal");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/auth.test.ts`
Expected: FAIL — the credentials-keys assertion reports `["email", "password"]`, and `token.sedeActivaId` is `undefined`.

- [ ] **Step 3: Extend the NextAuth type augmentation**

Replace the whole of `src/types/next-auth.d.ts` with:

```ts
import type { DefaultSession } from "next-auth";

type TorqueFlowRole = "ADMIN" | "TECNICO" | "RECEPCION";

declare module "next-auth" {
  interface User {
    role: TorqueFlowRole;
    tenantSlug: string;
    tenantSchema: string;
    /** The sede this session operates in. Chosen at login, validated in authorize(). */
    sedeActivaId: string;
    /** Display-only copy, so the dashboard header needs no query. */
    sedeActivaNombre: string;
  }

  interface Session {
    user: {
      id: string;
      role: TorqueFlowRole;
      tenantSlug: string;
      tenantSchema: string;
      sedeActivaId: string;
      sedeActivaNombre: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: TorqueFlowRole;
    tenantSlug?: string;
    tenantSchema?: string;
    sedeActivaId?: string;
    sedeActivaNombre?: string;
  }
}
```

- [ ] **Step 4: Wire the callbacks and the credential field**

In `src/auth.ts`, add `sedeId` to the `credentials` declaration:

```ts
      credentials: {
        email: { label: "Correo", type: "email" },
        password: { label: "Contraseña", type: "password" },
        sedeId: { label: "Sede", type: "text" },
      },
```

and extend the two callbacks:

```ts
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.tenantSlug = user.tenantSlug;
        token.tenantSchema = user.tenantSchema;
        token.sedeActivaId = user.sedeActivaId;
        token.sedeActivaNombre = user.sedeActivaNombre;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.sub as string;
      session.user.role = token.role as "ADMIN" | "TECNICO" | "RECEPCION";
      session.user.tenantSlug = token.tenantSlug as string;
      session.user.tenantSchema = token.tenantSchema as string;
      session.user.sedeActivaId = token.sedeActivaId as string;
      session.user.sedeActivaNombre = token.sedeActivaNombre as string;
      return session;
    },
```

Leave `redirect` and everything else in the file exactly as it is.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/auth.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 6: Full verification pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full unit suite green. `authorizeCredentials` does not return the two new fields yet, which is a type error *only* if it is typed as returning `User` — it is typed as returning its own `AuthorizedUser` interface, so tsc stays green until Task 6 changes it. If tsc does complain here, do not weaken the types: go straight to Task 6.

- [ ] **Step 7: Commit**

```bash
git add src/types/next-auth.d.ts src/auth.ts src/auth.test.ts
git commit -m "fase6-task 5: carry sedeActivaId and sedeActivaNombre through the session"
git push origin main
```

---

### Task 6: `authorizeCredentials` validates the chosen sede

**Files:**
- Modify: `src/lib/auth/authorize-credentials.ts`
- Modify: `src/lib/auth/authorize-credentials.test.ts`

**Interfaces:**
- Consumes: `resolveSedeActiva` and `SedeActiva` from Task 4; the `sedeId` credential declared in Task 5.
- Produces: `AuthorizedUser` gains `sedeActivaId: string` and `sedeActivaNombre: string`, satisfying the `User` shape Task 5 declared.

- [ ] **Step 1: Write the failing test**

In `src/lib/auth/authorize-credentials.test.ts`, add the `resolveSedeActiva` mock next to the existing ones (the file already mocks `resolve-tenant`, `tenant-client` and `verify-credentials`):

```ts
const mockResolveSedeActiva = vi.fn();
vi.mock("@/lib/auth/sede-access", () => ({
  resolveSedeActiva: (...args: unknown[]) => mockResolveSedeActiva(...args),
}));
```

Add `mockResolveSedeActiva.mockReset();` to the existing `beforeEach`, then replace the final existing test (`"returns the correctly-shaped AuthorizedUser on valid credentials and valid tenant"`) with these four:

```ts
  it("returns null and never resolves a sede when sedeId is missing", async () => {
    const result = await authorizeCredentials({ email: "user@example.com", password: "correct" });

    expect(result).toBeNull();
    expect(mockResolveTenant).not.toHaveBeenCalled();
    expect(mockResolveSedeActiva).not.toHaveBeenCalled();
  });

  it("returns null when the user is not entitled to the chosen sede", async () => {
    mockResolveTenant.mockResolvedValue({ slug: "taller-perez", schemaName: "taller_perez" });
    mockGetTenantDb.mockReturnValue({});
    mockVerifyCredentials.mockResolvedValue({
      id: "u1",
      email: "user@example.com",
      nombre: "Juan Pérez",
      role: "TECNICO",
      passwordHash: "hashed",
    });
    mockResolveSedeActiva.mockResolvedValue(null);

    const result = await authorizeCredentials({
      email: "user@example.com",
      password: "correct",
      sedeId: "sede-ajena",
    });

    expect(result).toBeNull();
  });

  it("never resolves a sede when the password is wrong", async () => {
    mockResolveTenant.mockResolvedValue({ slug: "taller-perez", schemaName: "taller_perez" });
    mockGetTenantDb.mockReturnValue({});
    mockVerifyCredentials.mockResolvedValue(null);

    const result = await authorizeCredentials({
      email: "user@example.com",
      password: "wrong",
      sedeId: "sede-1",
    });

    expect(result).toBeNull();
    expect(mockResolveSedeActiva).not.toHaveBeenCalled();
  });

  it("returns the correctly-shaped AuthorizedUser including the resolved sede activa", async () => {
    mockResolveTenant.mockResolvedValue({ slug: "taller-perez", schemaName: "taller_perez" });
    const tenantDb = {};
    mockGetTenantDb.mockReturnValue(tenantDb);
    mockVerifyCredentials.mockResolvedValue({
      id: "u1",
      email: "user@example.com",
      nombre: "Juan Pérez",
      role: "ADMIN",
      passwordHash: "hashed",
    });
    mockResolveSedeActiva.mockResolvedValue({ id: "sede-1", nombre: "Sede principal" });

    const result = await authorizeCredentials({
      email: "user@example.com",
      password: "correct",
      sedeId: "sede-1",
    });

    expect(result).toEqual({
      id: "u1",
      email: "user@example.com",
      name: "Juan Pérez",
      role: "ADMIN",
      tenantSlug: "taller-perez",
      tenantSchema: "taller_perez",
      sedeActivaId: "sede-1",
      sedeActivaNombre: "Sede principal",
    });
    expect(mockResolveSedeActiva).toHaveBeenCalledWith(tenantDb, "u1", "ADMIN", "sede-1");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/auth/authorize-credentials.test.ts`
Expected: FAIL — the returned object has no `sedeActivaId`, and the "missing sedeId" case still returns a user.

- [ ] **Step 3: Write the implementation**

Replace the whole of `src/lib/auth/authorize-credentials.ts`:

```ts
import { resolveTenant } from "@/lib/tenant/resolve-tenant";
import { getTenantDb } from "@/lib/db/tenant-client";
import { verifyCredentials } from "@/lib/auth/verify-credentials";
import { resolveSedeActiva } from "@/lib/auth/sede-access";

export interface AuthorizedUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "TECNICO" | "RECEPCION";
  tenantSlug: string;
  tenantSchema: string;
  sedeActivaId: string;
  sedeActivaNombre: string;
}

/**
 * The tenant is already fixed by the subdomain before this runs (Edge
 * middleware, Fase 1), so resolveTenant() here is not the forbidden
 * re-derivation pattern -- there is no session yet to derive anything from.
 *
 * Order matters: credentials are verified BEFORE the sede is resolved, so a
 * failed password never performs a sede lookup and cannot be used to probe
 * which sedes exist. Every failure path returns null, and the login form
 * renders one uniform message for all of them.
 */
export async function authorizeCredentials(
  credentials: Record<string, unknown> | undefined,
): Promise<AuthorizedUser | null> {
  const email = credentials?.email;
  const password = credentials?.password;
  const sedeId = credentials?.sedeId;
  if (typeof email !== "string" || typeof password !== "string" || typeof sedeId !== "string") {
    return null;
  }
  if (!sedeId) return null;

  const tenant = await resolveTenant();
  if (!tenant) return null;

  const tenantDb = getTenantDb(tenant.schemaName);
  const usuario = await verifyCredentials(tenantDb, email, password);
  if (!usuario) return null;

  const sedeActiva = await resolveSedeActiva(tenantDb, usuario.id, usuario.role, sedeId);
  if (!sedeActiva) return null;

  return {
    id: usuario.id,
    email: usuario.email,
    name: usuario.nombre,
    role: usuario.role,
    tenantSlug: tenant.slug,
    tenantSchema: tenant.schemaName,
    sedeActivaId: sedeActiva.id,
    sedeActivaNombre: sedeActiva.nombre,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/auth/authorize-credentials.test.ts`
Expected: PASS — the pre-existing null-path tests plus the four above.

- [ ] **Step 5: Full verification pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full unit suite green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/authorize-credentials.ts src/lib/auth/authorize-credentials.test.ts
git commit -m "fase6-task 6: validate the chosen sede inside authorizeCredentials"
git push origin main
```

---
### Task 7: Sede selector in the login form

The login page has no session, so it cannot use `requireSession()`/`getTenantDb(session...)`. It resolves the tenant from the subdomain — the same thing `authorizeCredentials` already does — and lists that tenant's sedes. That read lives in its own module so it is unit-testable and so nobody mistakes it for a session-backed action.

**Files:**
- Create: `src/lib/sede/login-sedes.ts`
- Create: `src/lib/sede/login-sedes.test.ts`
- Modify: `src/app/login/page.tsx`
- Modify: `src/app/login/login-form.tsx`
- Modify: `src/app/login/login-form.test.tsx`
- Modify: `src/app/login/page.test.tsx`

**Interfaces:**
- Consumes: `resolveTenant()` from `@/lib/tenant/resolve-tenant`; `getTenantDb` from `@/lib/db/tenant-client`; the `sedeId` credential from Task 5 and its validation from Task 6.
- Produces:
  - `interface SedeOption { id: string; nombre: string }` exported from `@/lib/sede/login-sedes`
  - `listSedesDelTenant(): Promise<SedeOption[]>`
  - `LoginForm({ sedes }: { sedes: SedeOption[] })` — a required prop, consumed only by `src/app/login/page.tsx`.

- [ ] **Step 1: Write the failing test for the sede list**

Create `src/lib/sede/login-sedes.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockResolveTenant = vi.fn();
vi.mock("@/lib/tenant/resolve-tenant", () => ({
  resolveTenant: () => mockResolveTenant(),
}));

const mockFindMany = vi.fn();
const mockGetTenantDb = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: (...args: unknown[]) => {
    mockGetTenantDb(...args);
    return { sede: { findMany: mockFindMany } };
  },
}));

import { listSedesDelTenant } from "./login-sedes";

describe("listSedesDelTenant", () => {
  beforeEach(() => {
    mockResolveTenant.mockReset();
    mockGetTenantDb.mockReset();
    mockFindMany.mockReset();
  });

  it("returns an empty list when the subdomain resolves to no tenant", async () => {
    mockResolveTenant.mockResolvedValue(null);

    await expect(listSedesDelTenant()).resolves.toEqual([]);
    expect(mockGetTenantDb).not.toHaveBeenCalled();
  });

  it("lists the tenant's sedes by nombre, selecting only id and nombre", async () => {
    mockResolveTenant.mockResolvedValue({ slug: "taller-perez", schemaName: "taller_perez" });
    mockFindMany.mockResolvedValue([{ id: "sede-1", nombre: "Sede principal" }]);

    const result = await listSedesDelTenant();

    expect(result).toEqual([{ id: "sede-1", nombre: "Sede principal" }]);
    expect(mockGetTenantDb).toHaveBeenCalledWith("taller_perez");
    expect(mockFindMany).toHaveBeenCalledWith({
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sede/login-sedes.test.ts`
Expected: FAIL — `Failed to resolve import "./login-sedes"`.

- [ ] **Step 3: Write the sede list module**

Create `src/lib/sede/login-sedes.ts`:

```ts
import { resolveTenant } from "@/lib/tenant/resolve-tenant";
import { getTenantDb } from "@/lib/db/tenant-client";

export interface SedeOption {
  id: string;
  nombre: string;
}

/**
 * The only sede read in the app that runs without a session: the login page
 * needs the sede <select> populated before anyone has authenticated. The
 * tenant is already pinned by the subdomain (Edge middleware, Fase 1), so this
 * can never list another taller's sedes.
 *
 * Accepted, deliberate tradeoff: this discloses sede NAMES to an
 * unauthenticated visitor of the subdomain. They are branch labels, not
 * secrets, and the visitor already learns the taller exists from the subdomain
 * resolving at all. It buys a one-step login instead of a bespoke two-step
 * half-authenticated flow. See the plan's Global Constraints.
 *
 * select-only: never hand a whole Sede row to a public page.
 */
export async function listSedesDelTenant(): Promise<SedeOption[]> {
  const tenant = await resolveTenant();
  if (!tenant) return [];

  const tenantDb = getTenantDb(tenant.schemaName);
  return tenantDb.sede.findMany({
    select: { id: true, nombre: true },
    orderBy: { nombre: "asc" },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/sede/login-sedes.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Write the failing form tests**

Replace the whole of `src/app/login/login-form.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSignIn = vi.fn();
const mockPush = vi.fn();

vi.mock("next-auth/react", () => ({ signIn: (...args: unknown[]) => mockSignIn(...args) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

import { LoginForm } from "./login-form";

const SEDES = [
  { id: "sede-1", nombre: "Sede principal" },
  { id: "sede-2", nombre: "Sede norte" },
];

describe("LoginForm", () => {
  beforeEach(() => {
    mockSignIn.mockReset();
    mockPush.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("submits email, password and the chosen sedeId to signIn", async () => {
    mockSignIn.mockResolvedValue({ ok: true, error: null });
    render(<LoginForm sedes={SEDES} />);

    await userEvent.type(screen.getByLabelText("Correo"), "admin@taller-perez.test");
    await userEvent.type(screen.getByLabelText("Contraseña"), "SuperSecret123!");
    await userEvent.selectOptions(screen.getByLabelText("Sede"), "sede-2");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(mockSignIn).toHaveBeenCalledWith("credentials", {
      email: "admin@taller-perez.test",
      password: "SuperSecret123!",
      sedeId: "sede-2",
      redirect: false,
    });
  });

  it("defaults to the first sede when the user does not touch the select", async () => {
    mockSignIn.mockResolvedValue({ ok: true, error: null });
    render(<LoginForm sedes={SEDES} />);

    await userEvent.type(screen.getByLabelText("Correo"), "admin@taller-perez.test");
    await userEvent.type(screen.getByLabelText("Contraseña"), "SuperSecret123!");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(mockSignIn).toHaveBeenCalledWith(
      "credentials",
      expect.objectContaining({ sedeId: "sede-1" }),
    );
  });

  it("redirects to /clientes after a successful login", async () => {
    mockSignIn.mockResolvedValue({ ok: true, error: null });
    render(<LoginForm sedes={SEDES} />);

    await userEvent.type(screen.getByLabelText("Correo"), "admin@taller-perez.test");
    await userEvent.type(screen.getByLabelText("Contraseña"), "SuperSecret123!");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(mockPush).toHaveBeenCalledWith("/clientes");
  });

  it("shows one uniform error when signIn fails, without saying which field was wrong", async () => {
    mockSignIn.mockResolvedValue({ ok: false, error: "CredentialsSignin" });
    render(<LoginForm sedes={SEDES} />);

    await userEvent.type(screen.getByLabelText("Correo"), "admin@taller-perez.test");
    await userEvent.type(screen.getByLabelText("Contraseña"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Correo, contraseña o sede incorrectos");
  });

  it("explains the problem and disables submission when the taller has no sedes", () => {
    render(<LoginForm sedes={[]} />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Este taller no tiene sedes configuradas. Contacta al administrador.",
    );
    expect(screen.getByRole("button", { name: "Ingresar" })).toBeDisabled();
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run src/app/login/login-form.test.tsx`
Expected: FAIL — `Unable to find a label with the text of: Sede`.

- [ ] **Step 7: Add the selector to the form**

Replace the whole of `src/app/login/login-form.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import type { SedeOption } from "@/lib/sede/login-sedes";

export function LoginForm({ sedes }: { sedes: SedeOption[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const sinSedes = sedes.length === 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const sedeId = String(formData.get("sedeId") ?? "");

    const result = await signIn("credentials", { email, password, sedeId, redirect: false });
    setIsPending(false);

    if (!result?.ok) {
      // One message for every failure -- wrong password, unknown email, and
      // "not assigned to that sede" are indistinguishable on purpose, so this
      // form cannot be used to enumerate accounts or sede assignments.
      setError("Correo, contraseña o sede incorrectos");
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

      <label htmlFor="sedeId">Sede</label>
      <select id="sedeId" name="sedeId" required defaultValue={sedes[0]?.id ?? ""}>
        {sedes.map((sede) => (
          <option key={sede.id} value={sede.id}>
            {sede.nombre}
          </option>
        ))}
      </select>

      <button type="submit" disabled={isPending || sinSedes}>
        {isPending ? "Ingresando..." : "Ingresar"}
      </button>

      {sinSedes ? (
        <p role="alert">Este taller no tiene sedes configuradas. Contacta al administrador.</p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
```

The `defaultValue={sedes[0]?.id ?? ""}` is what makes the second test pass: without it React leaves the select uncontrolled and the browser's own first-option default is still `sedes[0]`, but stating it explicitly keeps the submitted value obvious and survives any future reordering of the options.

- [ ] **Step 8: Feed the sedes in from the page**

Replace the whole of `src/app/login/page.tsx`:

```tsx
import { LoginForm } from "./login-form";
import { getLoginErrorMessage } from "@/lib/auth/login-error-message";
import { listSedesDelTenant } from "@/lib/sede/login-sedes";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const rawError = Array.isArray(params.error) ? params.error[0] : params.error;
  const errorMessage = getLoginErrorMessage(rawError);
  const sedes = await listSedesDelTenant();

  return (
    <main style={{ padding: "2rem", maxWidth: "24rem", margin: "0 auto" }}>
      <h1>Ingresar a TorqueFlow</h1>
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      <LoginForm sedes={sedes} />
    </main>
  );
}
```

- [ ] **Step 9: Update the page test**

Open `src/app/login/page.test.tsx`. It renders `LoginPage` and asserts on the error-message copy. Add this mock next to whatever mocks it already declares, so the page test does not hit the database:

```ts
vi.mock("@/lib/sede/login-sedes", () => ({
  listSedesDelTenant: () => Promise.resolve([{ id: "sede-1", nombre: "Sede principal" }]),
}));
```

Do not change any existing assertion in that file — the error-message behavior is unchanged by this task.

- [ ] **Step 10: Run the login tests**

Run: `npx vitest run src/app/login src/lib/sede`
Expected: PASS — 5 form tests, 2 login-sedes tests, plus the pre-existing page tests.

- [ ] **Step 11: Full verification pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full unit suite green.

- [ ] **Step 12: Commit**

```bash
git add src/lib/sede/login-sedes.ts src/lib/sede/login-sedes.test.ts src/app/login
git commit -m "fase6-task 7: add the sede selector to the login form"
git push origin main
```

---

### Task 8: Sede validation schemas

**Files:**
- Create: `src/lib/validation/sede.ts`
- Create: `src/lib/validation/sede.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `sedeInputSchema` → `{ nombre: string; direccion?: string }`, exported type `SedeInput`
  - `usuarioSedesInputSchema` → `{ sedeIds: string[] }`, exported type `UsuarioSedesInput`
  - Exact error strings, asserted verbatim by Tasks 9, 11 and 20: `"El nombre es obligatorio"`, `"Selecciona al menos una sede"`.

`nombre`/`direccion` mirror `proveedorInputSchema`'s shape exactly (required name, optional strings tolerating `""`), because `Sede.direccion` is `String?` in the schema.

- [ ] **Step 1: Write the failing test**

Create `src/lib/validation/sede.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sedeInputSchema, usuarioSedesInputSchema } from "./sede";

describe("sedeInputSchema", () => {
  it("accepts a nombre with an empty direccion", () => {
    const result = sedeInputSchema.safeParse({ nombre: "Sede norte", direccion: "" });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ nombre: "Sede norte", direccion: "" });
  });

  it("accepts a nombre with a direccion", () => {
    const result = sedeInputSchema.safeParse({ nombre: "Sede norte", direccion: "Calle 1 #2-3" });

    expect(result.success).toBe(true);
  });

  it("rejects an empty nombre with the Spanish message", () => {
    const result = sedeInputSchema.safeParse({ nombre: "", direccion: "" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("El nombre es obligatorio");
  });

  it("rejects a null nombre with the same Spanish message (the ?? \"\" formData guard)", () => {
    const result = sedeInputSchema.safeParse({ nombre: null, direccion: "" });

    expect(result.success).toBe(false);
  });
});

describe("usuarioSedesInputSchema", () => {
  it("accepts one or more sede ids", () => {
    const result = usuarioSedesInputSchema.safeParse({ sedeIds: ["sede-1", "sede-2"] });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ sedeIds: ["sede-1", "sede-2"] });
  });

  it("rejects an empty selection with the Spanish message", () => {
    const result = usuarioSedesInputSchema.safeParse({ sedeIds: [] });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Selecciona al menos una sede");
  });

  it("rejects non-string entries", () => {
    const result = usuarioSedesInputSchema.safeParse({ sedeIds: [42] });

    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/validation/sede.test.ts`
Expected: FAIL — `Failed to resolve import "./sede"`.

- [ ] **Step 3: Write the schemas**

Create `src/lib/validation/sede.ts`:

```ts
import { z } from "zod";

/**
 * Same shape as proveedorInputSchema: a required nombre plus optional strings
 * that tolerate "" (Sede.direccion is String? in the tenant schema, and an
 * untouched <input> submits "" rather than being absent).
 */
export const sedeInputSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  direccion: z.string().optional().or(z.literal("")),
});

export type SedeInput = z.infer<typeof sedeInputSchema>;

/**
 * The checkbox set on /usuarios. At least one sede is mandatory: a
 * TECNICO/RECEPCION with zero assignments cannot pass the login sede gate at
 * all, so saving an empty selection would silently lock the user out.
 */
export const usuarioSedesInputSchema = z.object({
  sedeIds: z.array(z.string().min(1)).min(1, "Selecciona al menos una sede"),
});

export type UsuarioSedesInput = z.infer<typeof usuarioSedesInputSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/validation/sede.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation/sede.ts src/lib/validation/sede.test.ts
git commit -m "fase6-task 8: add sede and usuario-sede validation schemas"
git push origin main
```

---
### Task 9: Sede CRUD server actions (ADMIN-only)

**Files:**
- Create: `src/app/actions/sede-actions.ts`
- Create: `src/app/actions/sede-actions.test.ts`

**Interfaces:**
- Consumes: `sedeInputSchema` from Task 8; `requireRole` from `@/lib/auth/guards`; `getTenantDb`; `friendlyPrismaErrorMessage`.
- Produces:
  - `interface SedeFormState { error: string | null; success: boolean }`
  - `listSedes(): Promise<Sede[]>`
  - `getSede(id: string): Promise<Sede | null>`
  - `createSedeAction(prevState: SedeFormState, formData: FormData): Promise<SedeFormState>`
  - `updateSedeAction(id: string, prevState: SedeFormState, formData: FormData): Promise<SedeFormState>`
  - `deleteSedeAction(id: string): Promise<void>`

Shape and error-handling copied from `proveedor-actions.ts`, with two deliberate differences: **every action is `requireRole(["ADMIN"])`** (not `["ADMIN","RECEPCION"]`), and `deleteSedeAction` pre-checks its dependents instead of letting a raw foreign-key error reach the user.

`deleteSedeAction` refuses in four cases, checked in this order: the sede does not exist; it is the tenant's last remaining sede; it still has órdenes or bodegas (both FKs are `Restrict`); it still has users assigned (`UsuarioSede.sede` is `Restrict`, Task 1). The "last sede" rule matters because `OrdenTrabajo.sedeId` and `Bodega.sedeId` are required — a tenant with zero sedes can create neither, and nobody can log in.

- [ ] **Step 1: Write the failing test**

Create `src/app/actions/sede-actions.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockFindMany = vi.fn();
const mockFindUnique = vi.fn();
const mockSedeCount = vi.fn();
const mockOrdenCount = vi.fn();
const mockBodegaCount = vi.fn();
const mockUsuarioSedeCount = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    sede: {
      create: mockCreate,
      update: mockUpdate,
      delete: mockDelete,
      findMany: mockFindMany,
      findUnique: mockFindUnique,
      count: mockSedeCount,
    },
    ordenTrabajo: { count: mockOrdenCount },
    bodega: { count: mockBodegaCount },
    usuarioSede: { count: mockUsuarioSedeCount },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createSedeAction,
  updateSedeAction,
  deleteSedeAction,
  listSedes,
  type SedeFormState,
} from "./sede-actions";

const initialState: SedeFormState = { error: null, success: false };
const ADMIN = { user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };

describe("createSedeAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(ADMIN);
    mockCreate.mockReset();
  });

  it("is ADMIN-only", async () => {
    const formData = new FormData();
    formData.set("nombre", "Sede norte");

    await createSedeAction(initialState, formData);

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
  });

  it("returns a validation error when nombre is missing", async () => {
    const result = await createSedeAction(initialState, new FormData());

    expect(result.success).toBe(false);
    expect(result.error).toBe("El nombre es obligatorio");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the sede, storing an empty direccion as null", async () => {
    mockCreate.mockResolvedValue({ id: "sede-2" });
    const formData = new FormData();
    formData.set("nombre", "Sede norte");
    formData.set("direccion", "");

    const result = await createSedeAction(initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockCreate).toHaveBeenCalledWith({ data: { nombre: "Sede norte", direccion: null } });
  });

  it("propagates the redirect rejection and never writes when requireRole rejects", async () => {
    mockRequireRole.mockReset().mockRejectedValue(new Error("REDIRECT:/login?error=forbidden"));
    const formData = new FormData();
    formData.set("nombre", "Sede norte");

    await expect(createSedeAction(initialState, formData)).rejects.toThrow("REDIRECT:/login?error=forbidden");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("updateSedeAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(ADMIN);
    mockUpdate.mockReset();
  });

  it("updates nombre and direccion", async () => {
    mockUpdate.mockResolvedValue({ id: "sede-2" });
    const formData = new FormData();
    formData.set("nombre", "Sede norte renombrada");
    formData.set("direccion", "Calle 1 #2-3");

    const result = await updateSedeAction("sede-2", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "sede-2" },
      data: { nombre: "Sede norte renombrada", direccion: "Calle 1 #2-3" },
    });
  });
});

describe("deleteSedeAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(ADMIN);
    mockDelete.mockReset();
    mockFindUnique.mockReset().mockResolvedValue({ id: "sede-2", nombre: "Sede norte" });
    mockSedeCount.mockReset().mockResolvedValue(2);
    mockOrdenCount.mockReset().mockResolvedValue(0);
    mockBodegaCount.mockReset().mockResolvedValue(0);
    mockUsuarioSedeCount.mockReset().mockResolvedValue(0);
  });

  it("deletes an empty, non-last sede", async () => {
    await deleteSedeAction("sede-2");

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "sede-2" } });
  });

  it("refuses to delete a sede that does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(deleteSedeAction("sede-fantasma")).rejects.toThrow("Sede no encontrada");
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("refuses to delete the tenant's last sede", async () => {
    mockSedeCount.mockResolvedValue(1);

    await expect(deleteSedeAction("sede-2")).rejects.toThrow(
      "No puedes eliminar la única sede del taller.",
    );
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("refuses to delete a sede that still has órdenes", async () => {
    mockOrdenCount.mockResolvedValue(3);

    await expect(deleteSedeAction("sede-2")).rejects.toThrow(
      "No puedes eliminar una sede con órdenes o bodegas asociadas.",
    );
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("refuses to delete a sede that still has bodegas", async () => {
    mockBodegaCount.mockResolvedValue(1);

    await expect(deleteSedeAction("sede-2")).rejects.toThrow(
      "No puedes eliminar una sede con órdenes o bodegas asociadas.",
    );
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("refuses to delete a sede that still has usuarios assigned", async () => {
    mockUsuarioSedeCount.mockResolvedValue(2);

    await expect(deleteSedeAction("sede-2")).rejects.toThrow(
      "No puedes eliminar una sede con usuarios asignados. Reasígnalos primero.",
    );
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

describe("listSedes", () => {
  it("is ADMIN-only and lists sedes by nombre", async () => {
    mockRequireRole.mockReset().mockResolvedValue(ADMIN);
    mockFindMany.mockReset().mockResolvedValue([{ id: "sede-1", nombre: "Sede principal" }]);

    const result = await listSedes();

    expect(result).toEqual([{ id: "sede-1", nombre: "Sede principal" }]);
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
    expect(mockFindMany).toHaveBeenCalledWith({ orderBy: { nombre: "asc" } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/actions/sede-actions.test.ts`
Expected: FAIL — `Failed to resolve import "./sede-actions"`.

- [ ] **Step 3: Write the actions**

Create `src/app/actions/sede-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { sedeInputSchema } from "@/lib/validation/sede";
import type { Sede } from "@/generated/prisma-tenant";

export interface SedeFormState {
  error: string | null;
  success: boolean;
}

function parseSedeFormData(formData: FormData) {
  return sedeInputSchema.safeParse({
    nombre: formData.get("nombre") ?? "",
    direccion: formData.get("direccion") ?? "",
  });
}

/**
 * Sedes are the structural boundary that partitions the tenant's operational
 * data, and a UsuarioSede row is an authorization grant. Everything in this
 * module is therefore ADMIN-only -- deliberately stricter than bodega/proveedor
 * CRUD, which stay ["ADMIN", "RECEPCION"]. Same "structurally sensitive =>
 * ADMIN-only" rule Fase 5 applied to reportes.
 *
 * These reads are intentionally NOT sede-scoped: an ADMIN managing sedes must
 * see all of them, not just the one they happen to be logged into.
 */
export async function listSedes(): Promise<Sede[]> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.sede.findMany({ orderBy: { nombre: "asc" } });
}

export async function getSede(id: string): Promise<Sede | null> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.sede.findUnique({ where: { id } });
}

export async function createSedeAction(
  prevState: SedeFormState,
  formData: FormData,
): Promise<SedeFormState> {
  const parsed = parseSedeFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    await tenantDb.sede.create({
      data: { nombre: parsed.data.nombre, direccion: parsed.data.direccion || null },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al crear la sede"), success: false };
  }

  revalidatePath("/sedes");
  return { error: null, success: true };
}

export async function updateSedeAction(
  id: string,
  prevState: SedeFormState,
  formData: FormData,
): Promise<SedeFormState> {
  const parsed = parseSedeFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    await tenantDb.sede.update({
      where: { id },
      data: { nombre: parsed.data.nombre, direccion: parsed.data.direccion || null },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al actualizar la sede"), success: false };
  }

  revalidatePath("/sedes");
  return { error: null, success: true };
}

/**
 * Pre-checks instead of letting the RESTRICT foreign keys surface as a raw
 * Prisma error: the three refusal reasons need three different Spanish
 * messages, and "last sede" is not a foreign key at all -- OrdenTrabajo.sedeId
 * and Bodega.sedeId are required, so a tenant with zero sedes can create
 * neither and nobody can log in.
 */
export async function deleteSedeAction(id: string): Promise<void> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const sede = await tenantDb.sede.findUnique({ where: { id }, select: { id: true } });
  if (!sede) {
    throw new Error("Sede no encontrada");
  }

  const totalSedes = await tenantDb.sede.count();
  if (totalSedes <= 1) {
    throw new Error("No puedes eliminar la única sede del taller.");
  }

  const [ordenes, bodegas] = await Promise.all([
    tenantDb.ordenTrabajo.count({ where: { sedeId: id } }),
    tenantDb.bodega.count({ where: { sedeId: id } }),
  ]);
  if (ordenes > 0 || bodegas > 0) {
    throw new Error("No puedes eliminar una sede con órdenes o bodegas asociadas.");
  }

  const asignados = await tenantDb.usuarioSede.count({ where: { sedeId: id } });
  if (asignados > 0) {
    throw new Error("No puedes eliminar una sede con usuarios asignados. Reasígnalos primero.");
  }

  try {
    await tenantDb.sede.delete({ where: { id } });
  } catch (err) {
    throw new Error(friendlyPrismaErrorMessage(err, "Error al eliminar la sede"));
  }

  revalidatePath("/sedes");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/actions/sede-actions.test.ts`
Expected: PASS — 13 tests.

- [ ] **Step 5: Full verification pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full unit suite green.

- [ ] **Step 6: Commit**

```bash
git add src/app/actions/sede-actions.ts src/app/actions/sede-actions.test.ts
git commit -m "fase6-task 9: add ADMIN-only sede CRUD actions"
git push origin main
```

---

### Task 10: `/sedes` pages

Plain RSC page plus two client forms, matching `/bodegas` and `/proveedores`. Per the established precedent (Fase 5 Task 8), a simple RSC list page gets no component test of its own; the client forms do.

**Files:**
- Create: `src/app/(dashboard)/sedes/page.tsx`
- Create: `src/app/(dashboard)/sedes/nueva-sede-form.tsx`
- Create: `src/app/(dashboard)/sedes/nueva-sede-form.test.tsx`
- Create: `src/app/(dashboard)/sedes/editar-sede-form.tsx`

**Interfaces:**
- Consumes: `listSedes`, `createSedeAction`, `updateSedeAction`, `deleteSedeAction`, `SedeFormState` from Task 9.
- Produces: the `/sedes` route, linked from the header in Task 19. The `<h1>` is `Sedes`; the create button reads `Crear sede`; the success status reads `Sede creada`. Task 20's e2e asserts those literals.

- [ ] **Step 1: Write the failing form test**

Create `src/app/(dashboard)/sedes/nueva-sede-form.test.tsx`:

```tsx
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const mockCreateSedeAction = vi.fn();
vi.mock("@/app/actions/sede-actions", () => ({
  createSedeAction: (...args: unknown[]) => mockCreateSedeAction(...args),
}));

import { NuevaSedeForm } from "./nueva-sede-form";

describe("NuevaSedeForm", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a nombre field, a direccion field and a submit button", () => {
    render(<NuevaSedeForm />);

    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
    expect(screen.getByLabelText("Dirección")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear sede" })).toBeInTheDocument();
  });

  it("marks nombre as required and direccion as optional", () => {
    render(<NuevaSedeForm />);

    expect(screen.getByLabelText("Nombre")).toBeRequired();
    expect(screen.getByLabelText("Dirección")).not.toBeRequired();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/(dashboard)/sedes/nueva-sede-form.test.tsx"`
Expected: FAIL — `Failed to resolve import "./nueva-sede-form"`.

- [ ] **Step 3: Write the create form**

Create `src/app/(dashboard)/sedes/nueva-sede-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { createSedeAction, type SedeFormState } from "@/app/actions/sede-actions";

const initialState: SedeFormState = { error: null, success: false };

export function NuevaSedeForm() {
  const [state, formAction, isPending] = useActionState(createSedeAction, initialState);

  return (
    <form noValidate action={formAction}>
      <label htmlFor="nombre">Nombre</label>
      <input id="nombre" name="nombre" required />

      <label htmlFor="direccion">Dirección</label>
      <input id="direccion" name="direccion" />

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Crear sede"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Sede creada</p> : null}
    </form>
  );
}
```

- [ ] **Step 4: Write the edit/delete form**

Create `src/app/(dashboard)/sedes/editar-sede-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { updateSedeAction, deleteSedeAction, type SedeFormState } from "@/app/actions/sede-actions";
import type { Sede } from "@/generated/prisma-tenant";

const initialState: SedeFormState = { error: null, success: false };

export function EditarSedeForm({ sede }: { sede: Sede }) {
  const [state, formAction, isPending] = useActionState(
    updateSedeAction.bind(null, sede.id),
    initialState,
  );

  return (
    <>
      <form noValidate action={formAction}>
        <label htmlFor={`nombre-${sede.id}`}>Nombre de {sede.nombre}</label>
        <input id={`nombre-${sede.id}`} name="nombre" defaultValue={sede.nombre} required />

        <label htmlFor={`direccion-${sede.id}`}>Dirección de {sede.nombre}</label>
        <input id={`direccion-${sede.id}`} name="direccion" defaultValue={sede.direccion ?? ""} />

        <button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar sede"}
        </button>

        {state.error ? <p role="alert">{state.error}</p> : null}
        {state.success ? <p role="status">Sede actualizada</p> : null}
      </form>

      <form action={deleteSedeAction.bind(null, sede.id)}>
        <button type="submit">Eliminar {sede.nombre}</button>
      </form>
    </>
  );
}
```

The per-sede label suffixes (`Nombre de Sede norte`) exist because this component is rendered once per row: without them, `getByLabelText("Nombre")` would be ambiguous in both tests and Playwright, which is exactly the strict-mode violation class Fase 2 Task 14 and Fase 5 Task 11 had to fix retroactively.

- [ ] **Step 5: Write the page**

Create `src/app/(dashboard)/sedes/page.tsx`:

```tsx
import { listSedes } from "@/app/actions/sede-actions";
import { NuevaSedeForm } from "./nueva-sede-form";
import { EditarSedeForm } from "./editar-sede-form";

export default async function SedesPage() {
  const sedes = await listSedes();

  return (
    <main>
      <h1>Sedes</h1>
      <NuevaSedeForm />
      <ul>
        {sedes.map((sede) => (
          <li key={sede.id}>
            <h2>{sede.nombre}</h2>
            {sede.direccion ? <p>{sede.direccion}</p> : null}
            <EditarSedeForm sede={sede} />
          </li>
        ))}
      </ul>
    </main>
  );
}
```

`listSedes` is `requireRole(["ADMIN"])`, so a TECNICO who navigates here directly is redirected to `/login?error=forbidden` by the existing guard — the same enforcement path `/reportes` uses, no new copy needed.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run "src/app/(dashboard)/sedes"`
Expected: PASS — 2 tests.

- [ ] **Step 7: Full verification pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full unit suite green.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(dashboard)/sedes"
git commit -m "fase6-task 10: add the /sedes admin pages"
git push origin main
```

---
### Task 11: `UsuarioSede` assignment actions (ADMIN-only)

**Scope decision, stated explicitly because it is a real one:** this project has no user-management surface at all today — no `/usuarios` page, no `usuario-actions.ts`; users exist only via the `npm run tenant:seed-user` CLI. Fase 6 therefore has to build *something*, and the minimum that makes `UsuarioSede` manageable is a **read-only user list with sede-assignment controls**. Creating, editing, deleting users and changing roles are **not** in this phase — that is design-doc módulo 10 ("Usuarios, roles y permisos"), which the roadmap does not assign to Fase 6. Do not expand this surface into user CRUD.

**Files:**
- Create: `src/app/actions/usuario-actions.ts`
- Create: `src/app/actions/usuario-actions.test.ts`

**Interfaces:**
- Consumes: `usuarioSedesInputSchema` from Task 8; `tenantDb.usuarioSede` from Task 1.
- Produces:
  - `interface UsuarioConSedes { id: string; nombre: string; email: string; role: "ADMIN" | "TECNICO" | "RECEPCION"; sedeIds: string[] }`
  - `interface UsuarioSedesFormState { error: string | null; success: boolean }`
  - `listUsuariosConSedes(): Promise<UsuarioConSedes[]>`
  - `setUsuarioSedesAction(usuarioId: string, prevState: UsuarioSedesFormState, formData: FormData): Promise<UsuarioSedesFormState>`

`setUsuarioSedesAction` replaces the whole assignment set in one `$transaction` (delete-all-then-createMany), which is the simplest correct semantics for a checkbox group: whatever is checked when the form is submitted is the complete truth afterwards. `createMany` is safe here because the composite PK makes duplicates impossible and the form cannot submit the same id twice.

- [ ] **Step 1: Write the failing test**

Create `src/app/actions/usuario-actions.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: vi.fn(),
}));

const mockUsuarioFindMany = vi.fn();
const mockUsuarioSedeDeleteMany = vi.fn();
const mockUsuarioSedeCreateMany = vi.fn();
const mockSedeFindMany = vi.fn();
const mockTransaction = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    usuario: { findMany: mockUsuarioFindMany },
    sede: { findMany: mockSedeFindMany },
    usuarioSede: { deleteMany: mockUsuarioSedeDeleteMany, createMany: mockUsuarioSedeCreateMany },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  listUsuariosConSedes,
  setUsuarioSedesAction,
  type UsuarioSedesFormState,
} from "./usuario-actions";

const initialState: UsuarioSedesFormState = { error: null, success: false };
const ADMIN = { user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };

describe("listUsuariosConSedes", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(ADMIN);
    mockUsuarioFindMany.mockReset();
  });

  it("is ADMIN-only and never selects passwordHash", async () => {
    mockUsuarioFindMany.mockResolvedValue([]);

    await listUsuariosConSedes();

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
    expect(mockUsuarioFindMany).toHaveBeenCalledWith({
      select: {
        id: true,
        nombre: true,
        email: true,
        role: true,
        sedes: { select: { sedeId: true } },
      },
      orderBy: { nombre: "asc" },
    });
  });

  it("flattens the bridge rows into a plain sedeIds array", async () => {
    mockUsuarioFindMany.mockResolvedValue([
      {
        id: "u2",
        nombre: "Tec E2E",
        email: "tec@example.test",
        role: "TECNICO",
        sedes: [{ sedeId: "sede-1" }, { sedeId: "sede-2" }],
      },
    ]);

    const result = await listUsuariosConSedes();

    expect(result).toEqual([
      {
        id: "u2",
        nombre: "Tec E2E",
        email: "tec@example.test",
        role: "TECNICO",
        sedeIds: ["sede-1", "sede-2"],
      },
    ]);
  });
});

describe("setUsuarioSedesAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(ADMIN);
    mockUsuarioSedeDeleteMany.mockReset();
    mockUsuarioSedeCreateMany.mockReset();
    mockSedeFindMany.mockReset().mockResolvedValue([{ id: "sede-1" }, { id: "sede-2" }]);
    mockTransaction.mockReset().mockResolvedValue(undefined);
  });

  it("is ADMIN-only", async () => {
    const formData = new FormData();
    formData.append("sedeIds", "sede-1");

    await setUsuarioSedesAction("u2", initialState, formData);

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
  });

  it("rejects an empty selection with the Spanish message and writes nothing", async () => {
    const result = await setUsuarioSedesAction("u2", initialState, new FormData());

    expect(result).toEqual({ error: "Selecciona al menos una sede", success: false });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects an id that does not belong to this tenant", async () => {
    const formData = new FormData();
    formData.append("sedeIds", "sede-de-otro-taller");

    const result = await setUsuarioSedesAction("u2", initialState, formData);

    expect(result).toEqual({
      error: "Una de las sedes seleccionadas no existe.",
      success: false,
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("replaces the whole assignment set atomically", async () => {
    const formData = new FormData();
    formData.append("sedeIds", "sede-1");
    formData.append("sedeIds", "sede-2");

    const result = await setUsuarioSedesAction("u2", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockUsuarioSedeDeleteMany).toHaveBeenCalledWith({ where: { usuarioId: "u2" } });
    expect(mockUsuarioSedeCreateMany).toHaveBeenCalledWith({
      data: [
        { usuarioId: "u2", sedeId: "sede-1" },
        { usuarioId: "u2", sedeId: "sede-2" },
      ],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/actions/usuario-actions.test.ts`
Expected: FAIL — `Failed to resolve import "./usuario-actions"`.

- [ ] **Step 3: Write the actions**

Create `src/app/actions/usuario-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { usuarioSedesInputSchema } from "@/lib/validation/sede";

export interface UsuarioConSedes {
  id: string;
  nombre: string;
  email: string;
  role: "ADMIN" | "TECNICO" | "RECEPCION";
  sedeIds: string[];
}

export interface UsuarioSedesFormState {
  error: string | null;
  success: boolean;
}

/**
 * Read-only user directory plus their sede grants. ADMIN-only: a UsuarioSede
 * row is an authorization grant, so seeing and editing who has which one is
 * an admin capability.
 *
 * select-only, and passwordHash is deliberately absent -- this project has
 * shipped a whole-Usuario-row leak twice (Fase 2's listTecnicos, Fase 3's
 * listRepuestoOptions). Do not switch this to include.
 */
export async function listUsuariosConSedes(): Promise<UsuarioConSedes[]> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const usuarios = await tenantDb.usuario.findMany({
    select: {
      id: true,
      nombre: true,
      email: true,
      role: true,
      sedes: { select: { sedeId: true } },
    },
    orderBy: { nombre: "asc" },
  });

  return usuarios.map((usuario) => ({
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    role: usuario.role,
    sedeIds: usuario.sedes.map((asignacion) => asignacion.sedeId),
  }));
}

/**
 * Replaces the user's entire assignment set with whatever the checkbox group
 * submitted -- the only semantics that make a checkbox group honest. The
 * delete + createMany pair runs in one $transaction so a failure can never
 * leave the user with zero sedes (which, for a TECNICO/RECEPCION, means
 * locked out of login entirely).
 *
 * Every submitted id is verified to exist in this tenant before writing;
 * without that, the FK would reject it as an opaque Prisma error and the user
 * would see a stack-trace-flavoured message instead of Spanish.
 */
export async function setUsuarioSedesAction(
  usuarioId: string,
  prevState: UsuarioSedesFormState,
  formData: FormData,
): Promise<UsuarioSedesFormState> {
  const parsed = usuarioSedesInputSchema.safeParse({
    sedeIds: formData.getAll("sedeIds").map((value) => String(value)),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const sedeIds = [...new Set(parsed.data.sedeIds)];
  const existentes = await tenantDb.sede.findMany({
    where: { id: { in: sedeIds } },
    select: { id: true },
  });
  if (existentes.length !== sedeIds.length) {
    return { error: "Una de las sedes seleccionadas no existe.", success: false };
  }

  try {
    await tenantDb.$transaction([
      tenantDb.usuarioSede.deleteMany({ where: { usuarioId } }),
      tenantDb.usuarioSede.createMany({
        data: sedeIds.map((sedeId) => ({ usuarioId, sedeId })),
      }),
    ]);
  } catch (err) {
    return {
      error: friendlyPrismaErrorMessage(err, "Error al asignar las sedes"),
      success: false,
    };
  }

  revalidatePath("/usuarios");
  return { error: null, success: true };
}
```

Note on the existing session: an ADMIN can strip their own assignments here without locking themselves out, because `resolveSedeActiva` bypasses `UsuarioSede` for ADMIN. A TECNICO/RECEPCION cannot be left with zero, which is what `usuarioSedesInputSchema`'s `.min(1)` enforces. Changing a user's assignments does **not** affect their currently-issued JWT — a logged-in user keeps their `sedeActivaId` until they log in again. That is acceptable for v1 (JWT sessions have this property for `role` too, since Fase 1) and is worth stating in the review rather than silently discovering.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/actions/usuario-actions.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Full verification pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full unit suite green.

- [ ] **Step 6: Commit**

```bash
git add src/app/actions/usuario-actions.ts src/app/actions/usuario-actions.test.ts
git commit -m "fase6-task 11: add ADMIN-only usuario-sede assignment actions"
git push origin main
```

---

### Task 12: `/usuarios` page with the sede-assignment checkboxes

**Files:**
- Create: `src/app/(dashboard)/usuarios/page.tsx`
- Create: `src/app/(dashboard)/usuarios/asignar-sedes-form.tsx`
- Create: `src/app/(dashboard)/usuarios/asignar-sedes-form.test.tsx`

**Interfaces:**
- Consumes: `listUsuariosConSedes`, `setUsuarioSedesAction`, `UsuarioConSedes`, `UsuarioSedesFormState` from Task 11; `listSedes` and `Sede` from Task 9.
- Produces: the `/usuarios` route, linked from the header in Task 19. The `<h1>` is `Usuarios`; the submit button reads `Guardar sedes de <nombre>`; the success status reads `Sedes actualizadas`. Task 20's e2e asserts those literals.

Each checkbox is labelled `<sede nombre> para <usuario nombre>` so that with several users on the page every control still has a unique accessible name — the same disambiguation rule as Task 10's per-row labels.

- [ ] **Step 1: Write the failing form test**

Create `src/app/(dashboard)/usuarios/asignar-sedes-form.test.tsx`:

```tsx
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const mockSetUsuarioSedesAction = vi.fn();
vi.mock("@/app/actions/usuario-actions", () => ({
  setUsuarioSedesAction: (...args: unknown[]) => mockSetUsuarioSedesAction(...args),
}));

import { AsignarSedesForm } from "./asignar-sedes-form";

const SEDES = [
  { id: "sede-1", nombre: "Sede principal" },
  { id: "sede-2", nombre: "Sede norte" },
];

const USUARIO = {
  id: "u2",
  nombre: "Tec E2E",
  email: "tec@example.test",
  role: "TECNICO" as const,
  sedeIds: ["sede-1"],
};

describe("AsignarSedesForm", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders one uniquely-labelled checkbox per sede", () => {
    render(<AsignarSedesForm usuario={USUARIO} sedes={SEDES} />);

    expect(screen.getByLabelText("Sede principal para Tec E2E")).toBeInTheDocument();
    expect(screen.getByLabelText("Sede norte para Tec E2E")).toBeInTheDocument();
  });

  it("pre-checks exactly the sedes the user is already assigned to", () => {
    render(<AsignarSedesForm usuario={USUARIO} sedes={SEDES} />);

    expect(screen.getByLabelText("Sede principal para Tec E2E")).toBeChecked();
    expect(screen.getByLabelText("Sede norte para Tec E2E")).not.toBeChecked();
  });

  it("submits every checkbox under the same sedeIds name", () => {
    render(<AsignarSedesForm usuario={USUARIO} sedes={SEDES} />);

    expect(screen.getByLabelText("Sede principal para Tec E2E")).toHaveAttribute("name", "sedeIds");
    expect(screen.getByLabelText("Sede norte para Tec E2E")).toHaveAttribute("name", "sedeIds");
  });

  it("labels its submit button with the user's name", () => {
    render(<AsignarSedesForm usuario={USUARIO} sedes={SEDES} />);

    expect(screen.getByRole("button", { name: "Guardar sedes de Tec E2E" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/(dashboard)/usuarios/asignar-sedes-form.test.tsx"`
Expected: FAIL — `Failed to resolve import "./asignar-sedes-form"`.

- [ ] **Step 3: Write the form**

Create `src/app/(dashboard)/usuarios/asignar-sedes-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import {
  setUsuarioSedesAction,
  type UsuarioConSedes,
  type UsuarioSedesFormState,
} from "@/app/actions/usuario-actions";

const initialState: UsuarioSedesFormState = { error: null, success: false };

export interface SedeCheckboxOption {
  id: string;
  nombre: string;
}

export function AsignarSedesForm({
  usuario,
  sedes,
}: {
  usuario: UsuarioConSedes;
  sedes: SedeCheckboxOption[];
}) {
  const [state, formAction, isPending] = useActionState(
    setUsuarioSedesAction.bind(null, usuario.id),
    initialState,
  );

  return (
    <form noValidate action={formAction}>
      {sedes.map((sede) => {
        const inputId = `sede-${sede.id}-usuario-${usuario.id}`;
        return (
          <div key={sede.id}>
            <input
              id={inputId}
              type="checkbox"
              name="sedeIds"
              value={sede.id}
              defaultChecked={usuario.sedeIds.includes(sede.id)}
            />
            <label htmlFor={inputId}>
              {sede.nombre} para {usuario.nombre}
            </label>
          </div>
        );
      })}

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : `Guardar sedes de ${usuario.nombre}`}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Sedes actualizadas</p> : null}
    </form>
  );
}
```

- [ ] **Step 4: Write the page**

Create `src/app/(dashboard)/usuarios/page.tsx`:

```tsx
import { listUsuariosConSedes } from "@/app/actions/usuario-actions";
import { listSedes } from "@/app/actions/sede-actions";
import { AsignarSedesForm } from "./asignar-sedes-form";

const ROLE_LABELS: Record<"ADMIN" | "TECNICO" | "RECEPCION", string> = {
  ADMIN: "Administrador",
  TECNICO: "Técnico",
  RECEPCION: "Recepción",
};

export default async function UsuariosPage() {
  // Sequential, not Promise.all: both calls go through requireRole, which
  // redirect()s by throwing. Racing two throwing guards is the pattern Fase 5
  // Task 9 deliberately avoided on /reportes.
  const usuarios = await listUsuariosConSedes();
  const sedes = await listSedes();

  return (
    <main>
      <h1>Usuarios</h1>
      <p>
        Los usuarios se crean con <code>npm run tenant:seed-user</code>. Aquí solo se asignan sus
        sedes. Un administrador puede trabajar en cualquier sede aunque no esté asignado.
      </p>
      <ul>
        {usuarios.map((usuario) => (
          <li key={usuario.id}>
            <h2>{usuario.nombre}</h2>
            <p>
              {usuario.email} — {ROLE_LABELS[usuario.role]}
            </p>
            <AsignarSedesForm
              usuario={usuario}
              sedes={sedes.map((sede) => ({ id: sede.id, nombre: sede.nombre }))}
            />
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run "src/app/(dashboard)/usuarios"`
Expected: PASS — 4 tests.

- [ ] **Step 6: Full verification pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full unit suite green.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/usuarios"
git commit -m "fase6-task 12: add the /usuarios sede-assignment page"
git push origin main
```

---
## Cross-cutting scoping tasks (13–18)

Tasks 13 through 18 migrate every pre-existing sede-aware call site from "the tenant's oldest sede" (or from no filter at all) to `session.user.sedeActivaId`. Two transformations recur; learn them once:

1. **List/aggregate reads** gain a spread scope fragment in their `where`:
   `where: { ...scopeOrden(session.user.sedeActivaId) }`.
2. **Get-one-by-id reads become `findFirst`, never `findUnique`.** `findUnique` only accepts unique columns, so it cannot carry the sede filter — leaving it in place is an IDOR straight across the sede boundary (a técnico in Sede B pasting a Sede A orden id). Every `findUnique({ where: { id } })` in a sede-aware module becomes `findFirst({ where: { id, ...scopeX(sedeActivaId) } })`.

The complete inventory of call sites, all found by reading the actual files (`grep -rn "findUnique\|findMany\|findFirst\|sede" src/app/actions/`), is in the Self-Review table at the end of this plan. A missed one is a data-isolation defect, not a coverage gap.

**Not migrated, deliberately:** `cliente-actions.ts`, `vehiculo-actions.ts`, `historial-actions.ts`, `proveedor-actions.ts` — clientes, vehículos and proveedores are tenant-wide by design (Global Constraints).

---

### Task 13: Sede-scope `orden-actions.ts`

**Files:**
- Modify: `src/app/actions/orden-actions.ts`
- Modify: `src/app/actions/orden-actions.test.ts`

**Interfaces:**
- Consumes: `scopeOrden` from Task 3; `session.user.sedeActivaId` from Task 5.
- Produces: the same five exported functions with unchanged signatures — `listOrdenes(estado?)`, `listOrdenesByVehiculo(vehiculoId)`, `getOrden(id)`, `listTecnicos()`, `createOrdenAction(clienteId, vehiculoId, prevState, formData)`, `updateEstadoOrdenAction(id, prevState, formData)` — now all confined to the sede activa. `OrdenWithDetalle`, `TecnicoOption`, `OrdenFormState` and `EstadoFormState` are unchanged.

- [ ] **Step 1: Write the failing tests**

In `src/app/actions/orden-actions.test.ts`, extend the tenant-client mock so `ordenTrabajo` exposes `findFirst` alongside whatever it already has, and give every `mockRequireRole`/`mockRequireSession` resolved value a `sedeActivaId`. The session objects become:

```ts
const SESSION = {
  user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez", sedeActivaId: "sede-1" },
};
```

Then replace the two existing default-sede tests (`"creates the order attached to the tenant's default Sede on valid input"` and `"returns an error when the tenant has no Sede..."`) with these, and add the four read-scoping tests:

```ts
  it("creates the order in the session's sede activa, never looking up a default sede", async () => {
    mockCreate.mockResolvedValue({ id: "o1" });
    const formData = new FormData();
    formData.set("kilometrajeIngreso", "45000");
    formData.set("sintomas", "Ruido al frenar");

    const result = await createOrdenAction("c1", "v1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockSedeFindFirst).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        clienteId: "c1",
        vehiculoId: "v1",
        sedeId: "sede-1",
        creadoPorId: "u1",
        mecanicoId: null,
        kilometrajeIngreso: 45000,
        sintomas: "Ruido al frenar",
      },
    });
  });

  it("lists only órdenes of the sede activa", async () => {
    mockRequireSession.mockReset().mockResolvedValue(SESSION);
    mockFindMany.mockReset().mockResolvedValue([]);

    await listOrdenes();

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { sedeId: "sede-1" },
      include: expect.anything(),
      orderBy: { createdAt: "desc" },
    });
  });

  it("combines the estado filter with the sede filter instead of replacing it", async () => {
    mockRequireSession.mockReset().mockResolvedValue(SESSION);
    mockFindMany.mockReset().mockResolvedValue([]);

    await listOrdenes("EN_PROCESO");

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { sedeId: "sede-1", estado: "EN_PROCESO" },
      include: expect.anything(),
      orderBy: { createdAt: "desc" },
    });
  });

  it("scopes a vehículo's órdenes to the sede activa (the vehículo itself is tenant-wide)", async () => {
    mockRequireSession.mockReset().mockResolvedValue(SESSION);
    mockFindMany.mockReset().mockResolvedValue([]);

    await listOrdenesByVehiculo("v1");

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { vehiculoId: "v1", sedeId: "sede-1" },
      orderBy: { createdAt: "desc" },
    });
  });

  it("uses findFirst with the sede filter for getOrden, so another sede's id resolves to null", async () => {
    mockRequireSession.mockReset().mockResolvedValue(SESSION);
    mockOrdenFindFirst.mockReset().mockResolvedValue(null);

    const result = await getOrden("orden-de-otra-sede");

    expect(result).toBeNull();
    expect(mockOrdenFindFirst).toHaveBeenCalledWith({
      where: { id: "orden-de-otra-sede", sedeId: "sede-1" },
      include: expect.anything(),
    });
  });

  it("lists only técnicos assigned to the sede activa", async () => {
    mockRequireSession.mockReset().mockResolvedValue(SESSION);
    mockUsuarioFindMany.mockReset().mockResolvedValue([]);

    await listTecnicos();

    expect(mockUsuarioFindMany).toHaveBeenCalledWith({
      where: { role: "TECNICO", sedes: { some: { sedeId: "sede-1" } } },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
  });

  it("refuses to change the estado of an orden from another sede", async () => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION);
    mockOrdenFindFirst.mockReset().mockResolvedValue(null);
    const formData = new FormData();
    formData.set("estado", "EN_PROCESO");

    const result = await updateEstadoOrdenAction("orden-de-otra-sede", { error: null }, formData);

    expect(result).toEqual({ error: "Orden no encontrada" });
    expect(mockOrdenFindFirst).toHaveBeenCalledWith({
      where: { id: "orden-de-otra-sede", sedeId: "sede-1" },
    });
  });
```

Add `mockOrdenFindFirst` and `mockUsuarioFindMany` to the module mock, and import `listOrdenes`, `listOrdenesByVehiculo`, `getOrden`, `listTecnicos`, `updateEstadoOrdenAction` alongside the existing imports. Keep `mockSedeFindFirst` in the mock object *on purpose*: the first new test asserts it is never called, which is the regression net that stops a future edit from quietly reinstating the oldest-sede fallback.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/actions/orden-actions.test.ts`
Expected: FAIL — `createOrdenAction` still calls `sede.findFirst`, and `mockOrdenFindFirst` is never called because the module still uses `findUnique`.

- [ ] **Step 3: Rewrite the reads and the create**

In `src/app/actions/orden-actions.ts`, add the import:

```ts
import { scopeOrden } from "@/lib/sede/scope";
```

Replace `listOrdenes`, `listOrdenesByVehiculo`, `getOrden` and `listTecnicos` with:

```ts
export async function listOrdenes(estado?: EstadoOrden): Promise<OrdenWithDetalle[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.ordenTrabajo.findMany({
    where: { ...scopeOrden(session.user.sedeActivaId), ...(estado ? { estado } : {}) },
    include: ORDEN_DETAIL_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

export async function listOrdenesByVehiculo(vehiculoId: string): Promise<OrdenTrabajo[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  // The Vehiculo is tenant-wide on purpose (a client may bring the same car to
  // any sede), but its órdenes belong to whichever sede opened them.
  return tenantDb.ordenTrabajo.findMany({
    where: { vehiculoId, ...scopeOrden(session.user.sedeActivaId) },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOrden(id: string): Promise<OrdenWithDetalle | null> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  // findFirst, not findUnique: findUnique cannot carry the sede filter, so an
  // id from another sede would resolve. This is the IDOR boundary.
  return tenantDb.ordenTrabajo.findFirst({
    where: { id, ...scopeOrden(session.user.sedeActivaId) },
    include: ORDEN_DETAIL_INCLUDE,
  });
}

export async function listTecnicos(): Promise<TecnicoOption[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  // Only técnicos who actually work in this sede can be assigned an orden here.
  return tenantDb.usuario.findMany({
    where: { role: "TECNICO", sedes: { some: { sedeId: session.user.sedeActivaId } } },
    select: { id: true, nombre: true },
    orderBy: { nombre: "asc" },
  });
}
```

In `createOrdenAction`, delete these five lines:

```ts
  const sede = await tenantDb.sede.findFirst({ orderBy: { createdAt: "asc" } });
  if (!sede) {
    return { error: "No hay una sede configurada para este taller.", success: false };
  }

```

and change the create's `sedeId` line from `sedeId: sede.id,` to:

```ts
        sedeId: session.user.sedeActivaId,
```

In `updateEstadoOrdenAction`, change the lookup from `findUnique` to:

```ts
  const orden = await tenantDb.ordenTrabajo.findFirst({
    where: { id, ...scopeOrden(session.user.sedeActivaId) },
  });
```

The existing `if (!orden) return { error: "Orden no encontrada" };` below it now doubles as the cross-sede refusal, with no new copy.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/actions/orden-actions.test.ts`
Expected: PASS — the pre-existing validation/transition tests plus the seven above.

- [ ] **Step 5: Full verification pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full unit suite green.

- [ ] **Step 6: Commit**

```bash
git add src/app/actions/orden-actions.ts src/app/actions/orden-actions.test.ts
git commit -m "fase6-task 13: scope orden-actions to the sede activa"
git push origin main
```

---

### Task 14: Sede-scope the orden-child mutations

Three modules gate every mutation on an `ordenTrabajo.findUnique({ where: { id: ordenId } })`. Each is a cross-sede write hole until the lookup carries the scope: without it, a técnico in Sede B can add items, mano de obra, or DVI photos to a Sede A orden by posting its id.

**Files:**
- Modify: `src/app/actions/item-orden-actions.ts` (`addItemOrdenAction`, `deleteItemOrdenAction`)
- Modify: `src/app/actions/mano-de-obra-actions.ts` (`addManoDeObraAction`, `deleteManoDeObraAction`)
- Modify: `src/app/actions/dvi-actions.ts` (`updateDviChecklistAction`, `addDviFotoAction`, `deleteDviFotoAction`)
- Modify: `src/app/actions/item-orden-actions.test.ts`
- Modify: `src/app/actions/mano-de-obra-actions.test.ts`
- Modify: `src/app/actions/dvi-actions.test.ts`

**Interfaces:**
- Consumes: `scopeOrden` and `scopeRepuesto` from Task 3; `session.user.sedeActivaId`.
- Produces: no signature changes at all. Every exported function keeps its exact name, parameters and return type; only the `where` clauses change.

- [ ] **Step 1: Write the failing tests**

In each of the three test files: add `sedeActivaId: "sede-1"` to every mocked session `user` object, replace the `ordenTrabajo.findUnique` mock with a `findFirst` mock, and add one cross-sede refusal test per exported function. The shape, using `addItemOrdenAction` as the template — write the equivalent for all seven functions:

```ts
  it("refuses to touch an orden from another sede", async () => {
    mockOrdenFindFirst.mockReset().mockResolvedValue(null);
    const formData = new FormData();
    formData.set("descripcion", "Pastillas de freno");
    formData.set("cantidad", "4");
    formData.set("precioUnitario", "15");

    const result = await addItemOrdenAction("orden-de-otra-sede", initialState, formData);

    expect(result).toEqual({ error: "Orden no encontrada", success: false });
    expect(mockOrdenFindFirst).toHaveBeenCalledWith({
      where: { id: "orden-de-otra-sede", sedeId: "sede-1" },
      select: { estado: true, factura: { select: { id: true } } },
    });
  });
```

For the two `delete*` functions in `item-orden-actions.ts` and `mano-de-obra-actions.ts`, which throw instead of returning a state, the assertion is `await expect(...).rejects.toThrow("Orden no encontrada")`.

Additionally, in `item-orden-actions.test.ts`, add the repuesto-scoping test — a repuesto in another sede's bodega must not be linkable:

```ts
  it("refuses a repuesto that lives in another sede's bodega", async () => {
    mockOrdenFindFirst.mockResolvedValue({ estado: "BORRADOR", factura: null });
    mockRepuestoFindFirst.mockReset().mockResolvedValue(null);
    const formData = new FormData();
    formData.set("repuestoId", "repuesto-de-otra-sede");
    formData.set("cantidad", "2");

    const result = await addItemOrdenAction("o1", initialState, formData);

    expect(result).toEqual({ error: "Repuesto no encontrado", success: false });
    expect(mockRepuestoFindFirst).toHaveBeenCalledWith({
      where: { id: "repuesto-de-otra-sede", bodega: { sedeId: "sede-1" } },
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/actions/item-orden-actions.test.ts src/app/actions/mano-de-obra-actions.test.ts src/app/actions/dvi-actions.test.ts`
Expected: FAIL — the modules still call `findUnique`, so `mockOrdenFindFirst` is never called.

- [ ] **Step 3: Apply the transformation to all three modules**

Add to each file's imports (`item-orden-actions.ts` needs both):

```ts
import { scopeOrden } from "@/lib/sede/scope";
```

```ts
import { scopeOrden, scopeRepuesto } from "@/lib/sede/scope";
```

In every one of the seven functions, replace the orden lookup. The `select` list differs per call site — keep whatever each one already selects, and change only the method and the `where`:

```ts
  const orden = await tenantDb.ordenTrabajo.findFirst({
    where: { id: ordenId, ...scopeOrden(session.user.sedeActivaId) },
    select: { estado: true, factura: { select: { id: true } } },
  });
```

In `addItemOrdenAction`, also replace the repuesto lookup:

```ts
    const repuesto = await tenantDb.repuesto.findFirst({
      where: { id: parsed.data.repuestoId, ...scopeRepuesto(session.user.sedeActivaId) },
    });
```

In `addDviFotoAction`, the `tenantDb.dvi.findUnique({ where: { ordenId } })` on line 91 stays a `findUnique`: `Dvi.ordenId` is `@unique` and the orden it points at was already sede-checked three lines above, so that lookup cannot reach another sede. Leave it alone and say so in the review.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/actions/item-orden-actions.test.ts src/app/actions/mano-de-obra-actions.test.ts src/app/actions/dvi-actions.test.ts`
Expected: PASS — all pre-existing tests plus eight new refusal tests.

- [ ] **Step 5: Full verification pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full unit suite green.

- [ ] **Step 6: Commit**

```bash
git add src/app/actions/item-orden-actions.ts src/app/actions/item-orden-actions.test.ts src/app/actions/mano-de-obra-actions.ts src/app/actions/mano-de-obra-actions.test.ts src/app/actions/dvi-actions.ts src/app/actions/dvi-actions.test.ts
git commit -m "fase6-task 14: scope orden-child mutations to the sede activa"
git push origin main
```

---
### Task 15: Sede-scope `bodega-actions.ts`

**Files:**
- Modify: `src/app/actions/bodega-actions.ts`
- Modify: `src/app/actions/bodega-actions.test.ts`

**Interfaces:**
- Consumes: `scopeBodega` from Task 3; `session.user.sedeActivaId`.
- Produces: unchanged signatures — `listBodegas()`, `getBodega(id)`, `createBodegaAction(prevState, formData)`, `updateBodegaAction(id, prevState, formData)`, `deleteBodegaAction(id)`, `BodegaFormState`. Bodegas are now created in, listed from, and mutable only within the sede activa.

`updateBodegaAction` and `deleteBodegaAction` currently address the row by id alone, so they are cross-sede write holes. Both become `updateMany`/`deleteMany` with the sede in the `where` and a `count === 0` check — the same shape `deleteItemOrdenAction` already uses for its `{ id, ordenId }` guard, so this is an existing project pattern, not a new one.

- [ ] **Step 1: Write the failing tests**

In `src/app/actions/bodega-actions.test.ts`: add `sedeActivaId: "sede-1"` to every mocked session user; add `mockUpdateMany` and `mockDeleteMany` to the `bodega` mock. Replace the existing `"creates the bodega attached to the tenant's default Sede on valid input"`, `"updates the bodega's nombre on valid input"`, `"requires ADMIN/RECEPCION and deletes by id"` and `"lists bodegas ordered by nombre"` tests with:

```ts
  it("creates the bodega in the session's sede activa, never looking up a default sede", async () => {
    mockCreate.mockResolvedValue({ id: "b1" });
    const formData = new FormData();
    formData.set("nombre", "Bodega norte");

    const result = await createBodegaAction(initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockSedeFindFirst).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith({ data: { nombre: "Bodega norte", sedeId: "sede-1" } });
  });

  it("updates a bodega of the sede activa", async () => {
    mockUpdateMany.mockReset().mockResolvedValue({ count: 1 });
    const formData = new FormData();
    formData.set("nombre", "Bodega renombrada");

    const result = await updateBodegaAction("b1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: "b1", sedeId: "sede-1" },
      data: { nombre: "Bodega renombrada" },
    });
  });

  it("refuses to update a bodega from another sede", async () => {
    mockUpdateMany.mockReset().mockResolvedValue({ count: 0 });
    const formData = new FormData();
    formData.set("nombre", "Bodega ajena");

    const result = await updateBodegaAction("b-otra-sede", initialState, formData);

    expect(result).toEqual({ error: "Bodega no encontrada en tu sede activa.", success: false });
  });

  it("deletes a bodega of the sede activa", async () => {
    mockDeleteMany.mockReset().mockResolvedValue({ count: 1 });

    await deleteBodegaAction("b1");

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: "b1", sedeId: "sede-1" } });
  });

  it("refuses to delete a bodega from another sede", async () => {
    mockDeleteMany.mockReset().mockResolvedValue({ count: 0 });

    await expect(deleteBodegaAction("b-otra-sede")).rejects.toThrow(
      "Bodega no encontrada en tu sede activa.",
    );
  });

  it("lists only the bodegas of the sede activa, ordered by nombre", async () => {
    mockRequireSession.mockReset().mockResolvedValue({
      user: { id: "u1", role: "TECNICO", tenantSchema: "taller_perez", sedeActivaId: "sede-1" },
    });
    mockFindMany.mockReset().mockResolvedValue([{ id: "b1", nombre: "Bodega norte" }]);

    const result = await listBodegas();

    expect(result).toEqual([{ id: "b1", nombre: "Bodega norte" }]);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { sedeId: "sede-1" },
      orderBy: { nombre: "asc" },
    });
  });

  it("returns null for a bodega id belonging to another sede", async () => {
    mockRequireSession.mockReset().mockResolvedValue({
      user: { id: "u1", role: "TECNICO", tenantSchema: "taller_perez", sedeActivaId: "sede-1" },
    });
    mockBodegaFindFirst.mockReset().mockResolvedValue(null);

    await expect(getBodega("b-otra-sede")).resolves.toBeNull();
    expect(mockBodegaFindFirst).toHaveBeenCalledWith({ where: { id: "b-otra-sede", sedeId: "sede-1" } });
  });
```

Add `mockBodegaFindFirst` to the mock and import `getBodega` alongside the existing imports.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/actions/bodega-actions.test.ts`
Expected: FAIL — `createBodegaAction` still calls `sede.findFirst`; `updateMany`/`deleteMany`/`findFirst` are never called.

- [ ] **Step 3: Rewrite the module**

Replace the whole of `src/app/actions/bodega-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { bodegaInputSchema } from "@/lib/validation/inventario";
import { scopeBodega } from "@/lib/sede/scope";
import type { Bodega } from "@/generated/prisma-tenant";

export interface BodegaFormState {
  error: string | null;
  success: boolean;
}

const NO_ENCONTRADA = "Bodega no encontrada en tu sede activa.";

export async function listBodegas(): Promise<Bodega[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.bodega.findMany({
    where: { ...scopeBodega(session.user.sedeActivaId) },
    orderBy: { nombre: "asc" },
  });
}

export async function getBodega(id: string): Promise<Bodega | null> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.bodega.findFirst({ where: { id, ...scopeBodega(session.user.sedeActivaId) } });
}

export async function createBodegaAction(
  prevState: BodegaFormState,
  formData: FormData,
): Promise<BodegaFormState> {
  const parsed = bodegaInputSchema.safeParse({ nombre: formData.get("nombre") ?? "" });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    await tenantDb.bodega.create({
      data: { nombre: parsed.data.nombre, sedeId: session.user.sedeActivaId },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al crear la bodega"), success: false };
  }

  revalidatePath("/bodegas");
  return { error: null, success: true };
}

/**
 * updateMany/deleteMany rather than update/delete by id: only those accept a
 * non-unique column in the where, which is how the sede filter gets in. A
 * count of 0 means the id exists in another sede (or not at all) -- one
 * message for both, so this cannot be used to probe other sedes' ids. Same
 * shape as deleteItemOrdenAction's { id, ordenId } guard from Fase 2.
 */
export async function updateBodegaAction(
  id: string,
  prevState: BodegaFormState,
  formData: FormData,
): Promise<BodegaFormState> {
  const parsed = bodegaInputSchema.safeParse({ nombre: formData.get("nombre") ?? "" });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    const { count } = await tenantDb.bodega.updateMany({
      where: { id, ...scopeBodega(session.user.sedeActivaId) },
      data: { nombre: parsed.data.nombre },
    });
    if (count === 0) {
      return { error: NO_ENCONTRADA, success: false };
    }
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al actualizar la bodega"), success: false };
  }

  revalidatePath("/bodegas");
  return { error: null, success: true };
}

export async function deleteBodegaAction(id: string): Promise<void> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  let count: number;
  try {
    ({ count } = await tenantDb.bodega.deleteMany({
      where: { id, ...scopeBodega(session.user.sedeActivaId) },
    }));
  } catch (err) {
    throw new Error(friendlyPrismaErrorMessage(err, "Error al eliminar la bodega"));
  }
  if (count === 0) {
    throw new Error(NO_ENCONTRADA);
  }
  revalidatePath("/bodegas");
}
```

Note the `count === 0` check in `deleteBodegaAction` sits *outside* the try/catch: throwing `NO_ENCONTRADA` from inside would be caught by the very `catch` below it and re-wrapped as "Error al eliminar la bodega". That exact bug shape was fixed in Fase 2's `deleteItemOrdenAction` with an `instanceof`/message re-throw; hoisting the check out of the try is the cleaner form of the same fix.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/actions/bodega-actions.test.ts`
Expected: PASS — the pre-existing validation/authorization tests plus the seven above.

- [ ] **Step 5: Full verification pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full unit suite green.

- [ ] **Step 6: Commit**

```bash
git add src/app/actions/bodega-actions.ts src/app/actions/bodega-actions.test.ts
git commit -m "fase6-task 15: scope bodega-actions to the sede activa"
git push origin main
```

---

### Task 16: Sede-scope `repuesto-actions.ts` and `entrada-mercancia-actions.ts`

Repuestos and entradas both inherit their sede through `Bodega`. Two rules apply to both modules: reads filter with `scopeRepuesto` / `scopeEntrada`, and **every write that accepts a `bodegaId` from the client must first prove that bodega belongs to the sede activa** — otherwise a user posts another sede's bodega id and creates a repuesto over there.

**Files:**
- Modify: `src/app/actions/repuesto-actions.ts`
- Modify: `src/app/actions/repuesto-actions.test.ts`
- Modify: `src/app/actions/entrada-mercancia-actions.ts`
- Modify: `src/app/actions/entrada-mercancia-actions.test.ts`

**Interfaces:**
- Consumes: `scopeRepuesto`, `scopeEntrada`, `scopeBodega` from Task 3; `session.user.sedeActivaId`.
- Produces: unchanged signatures throughout — `listRepuestos()`, `listRepuestoOptions(bodegaId?)`, `getRepuesto(id)`, `createRepuestoAction`, `updateRepuestoAction`, `deleteRepuestoAction`, `RepuestoWithDetalle`, `RepuestoOption`, `RepuestoFormState`, `listEntradas()`, `getEntrada(id)`, `createEntradaMercanciaAction`, `addEntradaItemAction`, `EntradaWithDetalle`, `EntradaFormState`. New shared error copy: `"La bodega seleccionada no pertenece a tu sede activa."`

- [ ] **Step 1: Write the failing tests**

Add `sedeActivaId: "sede-1"` to every mocked session in both test files, add `findFirst` mocks for `repuesto`, `bodega` and `entradaMercancia`, and add:

In `repuesto-actions.test.ts`:

```ts
  it("lists only repuestos whose bodega is in the sede activa", async () => {
    mockFindMany.mockReset().mockResolvedValue([]);

    await listRepuestos();

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { bodega: { sedeId: "sede-1" } },
      include: expect.anything(),
      orderBy: { nombre: "asc" },
    });
  });

  it("combines an explicit bodegaId with the sede filter in listRepuestoOptions", async () => {
    mockFindMany.mockReset().mockResolvedValue([]);

    await listRepuestoOptions("b1");

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { bodegaId: "b1", bodega: { sedeId: "sede-1" } },
      select: { id: true, codigo: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
  });

  it("still applies the sede filter when no bodegaId is given", async () => {
    mockFindMany.mockReset().mockResolvedValue([]);

    await listRepuestoOptions();

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { bodega: { sedeId: "sede-1" } },
      select: { id: true, codigo: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
  });

  it("refuses to create a repuesto in a bodega from another sede", async () => {
    mockBodegaFindFirst.mockReset().mockResolvedValue(null);
    const formData = new FormData();
    formData.set("codigo", "FRN-001");
    formData.set("nombre", "Filtro de aceite");
    formData.set("precioCompra", "8");
    formData.set("precioVenta", "18.9");
    formData.set("stockActual", "0");
    formData.set("stockMinimo", "5");
    formData.set("bodegaId", "b-otra-sede");

    const result = await createRepuestoAction(initialState, formData);

    expect(result).toEqual({
      error: "La bodega seleccionada no pertenece a tu sede activa.",
      success: false,
    });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockBodegaFindFirst).toHaveBeenCalledWith({
      where: { id: "b-otra-sede", sedeId: "sede-1" },
      select: { id: true },
    });
  });

  it("refuses to delete a repuesto from another sede", async () => {
    mockDeleteMany.mockReset().mockResolvedValue({ count: 0 });

    await expect(deleteRepuestoAction("r-otra-sede")).rejects.toThrow(
      "Repuesto no encontrado en tu sede activa.",
    );
  });
```

In `entrada-mercancia-actions.test.ts`:

```ts
  it("lists only entradas whose bodega is in the sede activa", async () => {
    mockFindMany.mockReset().mockResolvedValue([]);

    await listEntradas();

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { bodega: { sedeId: "sede-1" } },
      include: expect.anything(),
      orderBy: { createdAt: "desc" },
    });
  });

  it("refuses to create an entrada against a bodega from another sede", async () => {
    mockBodegaFindFirst.mockReset().mockResolvedValue(null);
    const formData = new FormData();
    formData.set("proveedorId", "p1");
    formData.set("bodegaId", "b-otra-sede");

    const result = await createEntradaMercanciaAction(initialState, formData);

    expect(result).toEqual({
      error: "La bodega seleccionada no pertenece a tu sede activa.",
      success: false,
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("refuses to add an item to an entrada from another sede", async () => {
    mockEntradaFindFirst.mockReset().mockResolvedValue(null);
    mockRepuestoFindFirst.mockReset().mockResolvedValue({ bodegaId: "b1" });
    const formData = new FormData();
    formData.set("repuestoId", "r1");
    formData.set("cantidad", "20");
    formData.set("precioCompraUnitario", "8");

    const result = await addEntradaItemAction("e-otra-sede", initialState, formData);

    expect(result).toEqual({ error: "Entrada no encontrada", success: false });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/actions/repuesto-actions.test.ts src/app/actions/entrada-mercancia-actions.test.ts`
Expected: FAIL — the `where` clauses carry no sede filter, and the bodega ownership check does not exist.

- [ ] **Step 3: Rewrite `repuesto-actions.ts`**

Add the imports:

```ts
import { scopeBodega, scopeRepuesto } from "@/lib/sede/scope";
```

Add the shared constants near `stockInicialSchema`:

```ts
const BODEGA_AJENA = "La bodega seleccionada no pertenece a tu sede activa.";
const REPUESTO_NO_ENCONTRADO = "Repuesto no encontrado en tu sede activa.";
```

Replace the three reads:

```ts
export async function listRepuestos(): Promise<RepuestoWithDetalle[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.repuesto.findMany({
    where: { ...scopeRepuesto(session.user.sedeActivaId) },
    include: REPUESTO_DETAIL_INCLUDE,
    orderBy: { nombre: "asc" },
  });
}

export async function listRepuestoOptions(bodegaId?: string): Promise<RepuestoOption[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.repuesto.findMany({
    where: {
      ...(bodegaId ? { bodegaId } : {}),
      ...scopeRepuesto(session.user.sedeActivaId),
    },
    select: { id: true, codigo: true, nombre: true },
    orderBy: { nombre: "asc" },
  });
}

export async function getRepuesto(id: string): Promise<RepuestoWithDetalle | null> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.repuesto.findFirst({
    where: { id, ...scopeRepuesto(session.user.sedeActivaId) },
    include: REPUESTO_DETAIL_INCLUDE,
  });
}
```

In **both** `createRepuestoAction` and `updateRepuestoAction`, insert this block immediately after `const tenantDb = getTenantDb(session.user.tenantSchema);`:

```ts
  const bodega = await tenantDb.bodega.findFirst({
    where: { id: parsed.data.bodegaId, ...scopeBodega(session.user.sedeActivaId) },
    select: { id: true },
  });
  if (!bodega) {
    return { error: BODEGA_AJENA, success: false };
  }
```

Then change `updateRepuestoAction`'s write from `update` to `updateMany` (so the sede filter applies to the row being changed, not only to the destination bodega), and add the count check:

```ts
  try {
    const { count } = await tenantDb.repuesto.updateMany({
      where: { id, ...scopeRepuesto(session.user.sedeActivaId) },
      data: {
        codigo: parsed.data.codigo,
        nombre: parsed.data.nombre,
        descripcion: parsed.data.descripcion || null,
        precioCompra: parsed.data.precioCompra,
        precioVenta: parsed.data.precioVenta,
        stockMinimo: parsed.data.stockMinimo,
        bodegaId: parsed.data.bodegaId,
        proveedorId: parsed.data.proveedorId || null,
      },
    });
    if (count === 0) {
      return { error: REPUESTO_NO_ENCONTRADO, success: false };
    }
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al actualizar el repuesto"), success: false };
  }
```

And `deleteRepuestoAction`:

```ts
export async function deleteRepuestoAction(id: string): Promise<void> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  let count: number;
  try {
    ({ count } = await tenantDb.repuesto.deleteMany({
      where: { id, ...scopeRepuesto(session.user.sedeActivaId) },
    }));
  } catch (err) {
    throw new Error(friendlyPrismaErrorMessage(err, "Error al eliminar el repuesto"));
  }
  if (count === 0) {
    throw new Error(REPUESTO_NO_ENCONTRADO);
  }
  revalidatePath("/repuestos");
}
```

- [ ] **Step 4: Rewrite `entrada-mercancia-actions.ts`**

Add the imports:

```ts
import { scopeBodega, scopeEntrada, scopeRepuesto } from "@/lib/sede/scope";
```

Add near the top:

```ts
const BODEGA_AJENA = "La bodega seleccionada no pertenece a tu sede activa.";
```

Replace the two reads:

```ts
export async function listEntradas(): Promise<EntradaWithDetalle[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.entradaMercancia.findMany({
    where: { ...scopeEntrada(session.user.sedeActivaId) },
    include: ENTRADA_DETAIL_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

export async function getEntrada(id: string): Promise<EntradaWithDetalle | null> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.entradaMercancia.findFirst({
    where: { id, ...scopeEntrada(session.user.sedeActivaId) },
    include: ENTRADA_DETAIL_INCLUDE,
  });
}
```

In `createEntradaMercanciaAction`, insert after `const tenantDb = ...`:

```ts
  const bodega = await tenantDb.bodega.findFirst({
    where: { id: parsed.data.bodegaId, ...scopeBodega(session.user.sedeActivaId) },
    select: { id: true },
  });
  if (!bodega) {
    return { error: BODEGA_AJENA, success: false };
  }
```

In `addEntradaItemAction`, replace the `Promise.all` pair of `findUnique` calls with sede-scoped `findFirst` calls, keeping the existing `select`s and the existing `bodegaId` cross-check below them untouched:

```ts
  const [entrada, repuesto] = await Promise.all([
    tenantDb.entradaMercancia.findFirst({
      where: { id: entradaId, ...scopeEntrada(session.user.sedeActivaId) },
      select: { bodegaId: true },
    }),
    tenantDb.repuesto.findFirst({
      where: { id: parsed.data.repuestoId, ...scopeRepuesto(session.user.sedeActivaId) },
      select: { bodegaId: true },
    }),
  ]);
```

The existing `repuesto.bodegaId !== entrada.bodegaId` check stays exactly as it is — it enforces the *bodega* invariant, which is narrower than and complementary to the sede filter.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/app/actions/repuesto-actions.test.ts src/app/actions/entrada-mercancia-actions.test.ts`
Expected: PASS — all pre-existing tests plus the eight above.

- [ ] **Step 6: Full verification pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full unit suite green.

- [ ] **Step 7: Commit**

```bash
git add src/app/actions/repuesto-actions.ts src/app/actions/repuesto-actions.test.ts src/app/actions/entrada-mercancia-actions.ts src/app/actions/entrada-mercancia-actions.test.ts
git commit -m "fase6-task 16: scope repuestos and entradas de mercancía to the sede activa"
git push origin main
```

---

### Task 17: Sede-scope `factura-actions.ts` and `pago-actions.ts`

`Factura` has no `sede_id` column; it reaches one through its required `OrdenTrabajo`. `Pago` reaches one through its `Factura`.

**Files:**
- Modify: `src/app/actions/factura-actions.ts`
- Modify: `src/app/actions/factura-actions.test.ts`
- Modify: `src/app/actions/pago-actions.ts`
- Modify: `src/app/actions/pago-actions.test.ts`

**Interfaces:**
- Consumes: `scopeFactura`, `scopeOrden` from Task 3; `session.user.sedeActivaId`.
- Produces: unchanged signatures — `listFacturas(estado?)`, `getFactura(id)`, `crearFacturaAction(ordenId, prevState, formData)`, `FacturaWithDetalle`, `FacturaFormState`, `registrarPagoAction(facturaId, prevState, formData)`.

- [ ] **Step 1: Write the failing tests**

Add `sedeActivaId: "sede-1"` to every mocked session in both files, add `findFirst` mocks for `factura` and `ordenTrabajo`, and add:

In `factura-actions.test.ts`:

```ts
  it("lists only facturas whose orden belongs to the sede activa", async () => {
    mockFindMany.mockReset().mockResolvedValue([]);

    await listFacturas();

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { orden: { sedeId: "sede-1" } },
      include: expect.anything(),
      orderBy: { createdAt: "desc" },
    });
  });

  it("combines the estado filter with the sede filter", async () => {
    mockFindMany.mockReset().mockResolvedValue([]);

    await listFacturas("PENDIENTE");

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { orden: { sedeId: "sede-1" }, estado: "PENDIENTE" },
      include: expect.anything(),
      orderBy: { createdAt: "desc" },
    });
  });

  it("returns null for a factura belonging to another sede", async () => {
    mockFacturaFindFirst.mockReset().mockResolvedValue(null);

    await expect(getFactura("f-otra-sede")).resolves.toBeNull();
    expect(mockFacturaFindFirst).toHaveBeenCalledWith({
      where: { id: "f-otra-sede", orden: { sedeId: "sede-1" } },
      include: expect.anything(),
    });
  });

  it("refuses to invoice an orden from another sede", async () => {
    mockOrdenFindFirst.mockReset().mockResolvedValue(null);

    const result = await crearFacturaAction("orden-de-otra-sede", initialState, new FormData());

    expect(result).toEqual({ error: "Orden no encontrada", success: false, facturaId: null });
    expect(mockOrdenFindFirst).toHaveBeenCalledWith({
      where: { id: "orden-de-otra-sede", sedeId: "sede-1" },
      include: { items: true, manoDeObra: true, factura: { select: { id: true } } },
    });
  });
```

In `pago-actions.test.ts`:

```ts
  it("refuses to register a payment against a factura from another sede", async () => {
    mockFacturaFindFirst.mockReset().mockResolvedValue(null);
    const formData = new FormData();
    formData.set("monto", "100");
    formData.set("metodoPago", "EFECTIVO");

    const result = await registrarPagoAction("f-otra-sede", initialState, formData);

    expect(result.error).toBe("Factura no encontrada");
    expect(mockFacturaFindFirst).toHaveBeenCalledWith({
      where: { id: "f-otra-sede", orden: { sedeId: "sede-1" } },
      select: { id: true },
    });
  });
```

Match the existing `registrarPagoAction` state shape when building `initialState` in that file — do not invent a new one.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/actions/factura-actions.test.ts src/app/actions/pago-actions.test.ts`
Expected: FAIL — no sede filter in the `where` clauses.

- [ ] **Step 3: Rewrite `factura-actions.ts`**

Add the import:

```ts
import { scopeFactura, scopeOrden } from "@/lib/sede/scope";
```

Replace the two reads:

```ts
export async function listFacturas(estado?: EstadoFactura): Promise<FacturaWithDetalle[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.factura.findMany({
    where: { ...scopeFactura(session.user.sedeActivaId), ...(estado ? { estado } : {}) },
    include: FACTURA_DETAIL_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

export async function getFactura(id: string): Promise<FacturaWithDetalle | null> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.factura.findFirst({
    where: { id, ...scopeFactura(session.user.sedeActivaId) },
    include: FACTURA_DETAIL_INCLUDE,
  });
}
```

In `crearFacturaAction`, change the orden lookup:

```ts
  const orden = await tenantDb.ordenTrabajo.findFirst({
    where: { id: ordenId, ...scopeOrden(session.user.sedeActivaId) },
    include: { items: true, manoDeObra: true, factura: { select: { id: true } } },
  });
```

Everything below it — the `if (!orden)`, `assertOrdenFacturable`, the totals math, and the whole `$transaction` with its `updateMany({ where: { id: repuestoId, stockActual: { gte: cantidad } } })` stock floor check — stays byte-for-byte as it is. The stock decrement needs no extra sede filter: it only ever touches `repuestoId`s that came off an orden this sede owns, and `ItemOrden.repuestoId` was itself sede-checked at insert time by Task 14.

- [ ] **Step 4: Rewrite `pago-actions.ts`**

Add the import:

```ts
import { scopeFactura } from "@/lib/sede/scope";
```

and change the factura lookup on line 34:

```ts
  const factura = await tenantDb.factura.findFirst({
    where: { id: facturaId, ...scopeFactura(session.user.sedeActivaId) },
    select: { id: true },
  });
```

The `findUniqueOrThrow` inside the transaction (line 59) stays a `findUniqueOrThrow`: it re-reads the same `facturaId` that was just sede-checked above, inside the same transaction, so it cannot reach another sede. Say so in the review rather than "fixing" it.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/app/actions/factura-actions.test.ts src/app/actions/pago-actions.test.ts`
Expected: PASS — all pre-existing tests plus the five above.

- [ ] **Step 6: Full verification pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full unit suite green.

- [ ] **Step 7: Commit**

```bash
git add src/app/actions/factura-actions.ts src/app/actions/factura-actions.test.ts src/app/actions/pago-actions.ts src/app/actions/pago-actions.test.ts
git commit -m "fase6-task 17: scope facturas and pagos to the sede activa"
git push origin main
```

---
### Task 18: Reportes — sede activa by default, explicit sede for comparison

This is the one place an ADMIN reads across sedes on purpose: design doc §5 módulo 12, "el dashboard de rentabilidad (módulo 9) suma sede como dimensión de filtro/comparación". Both report actions are already `requireRole(["ADMIN"])`, so the selector is ADMIN-only by construction and needs no extra guard.

Fase 5's private `resolveSedeId(tenantDb, sedeId)` — which fell back to `sede.findFirst({ orderBy: { createdAt: "asc" } })` — is deleted. Its replacement needs no database call at all: the default is `session.user.sedeActivaId`. Two consequences to state in the review, both of which are *effects of this phase's own change*, not opportunistic backlog fixes:

- `ReporteFiltrosAplicados.sedeId` becomes `string` instead of `string | null`, and both `if (!sedeId) return <zeroed>` branches disappear — a sede activa always exists, because the session cannot be issued without one (Task 6).
- The Fase 5 Minor finding "each report action independently re-runs the identical default-sede lookup" evaporates, since neither action queries for a sede any more.

**Files:**
- Modify: `src/app/actions/reporte-actions.ts`
- Modify: `src/app/actions/reporte-actions.test.ts`
- Modify: `src/app/(dashboard)/reportes/page.tsx`

**Interfaces:**
- Consumes: `session.user.sedeActivaId`; `listSedes` from Task 9 (for the page's selector).
- Produces:
  - `ReporteFiltros` unchanged: `{ desde: string; hasta: string; sedeId?: string }`
  - `ReporteFiltrosAplicados` **changed**: `{ desde: string; hasta: string; sedeId: string }` (no longer nullable)
  - `getReporteRentabilidad(filtros)` / `getReporteProductividad(filtros)` — same names, same parameter type, same `ReporteRentabilidadResult` / `ReporteProductividadResult` shapes apart from the non-null `sedeId`.

- [ ] **Step 1: Write the failing tests**

In `src/app/actions/reporte-actions.test.ts`: add `sedeActivaId: "sede-activa"` to the mocked `requireRole` session user. Delete the three tests that assert the oldest-sede fallback and the no-sede zeroed results (`"falls back to the tenant's oldest sede when no sedeId is supplied"`, `"returns zeroed totals without querying facturas when the tenant has no sede"`, `"returns an empty list without querying órdenes when the tenant has no sede"`) and replace them with:

```ts
  it("defaults to the session's sede activa without any sede lookup", async () => {
    mockFacturaFindMany.mockReset().mockResolvedValue([]);

    const result = await getReporteRentabilidad(FILTROS_VALIDOS);

    expect(mockSedeFindFirst).not.toHaveBeenCalled();
    expect(result.filtros.sedeId).toBe("sede-activa");
    expect(mockFacturaFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ orden: { sedeId: "sede-activa" } }),
      }),
    );
  });

  it("uses an explicit sedeId when supplied, so an ADMIN can compare sedes", async () => {
    mockFacturaFindMany.mockReset().mockResolvedValue([]);

    const result = await getReporteRentabilidad({ ...FILTROS_VALIDOS, sedeId: "sede-norte" });

    expect(result.filtros.sedeId).toBe("sede-norte");
    expect(mockSedeFindFirst).not.toHaveBeenCalled();
    expect(mockFacturaFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orden: { sedeId: "sede-norte" } }) }),
    );
  });

  it("productividad defaults to the session's sede activa too", async () => {
    mockOrdenFindMany.mockReset().mockResolvedValue([]);

    const result = await getReporteProductividad(FILTROS_VALIDOS);

    expect(mockSedeFindFirst).not.toHaveBeenCalled();
    expect(result.filtros.sedeId).toBe("sede-activa");
    expect(mockOrdenFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ sedeId: "sede-activa" }) }),
    );
  });

  it("productividad honours an explicit sedeId", async () => {
    mockOrdenFindMany.mockReset().mockResolvedValue([]);

    await getReporteProductividad({ ...FILTROS_VALIDOS, sedeId: "sede-norte" });

    expect(mockOrdenFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ sedeId: "sede-norte" }) }),
    );
  });
```

Keep `mockSedeFindFirst` in the tenant-client mock even though nothing calls it: `expect(mockSedeFindFirst).not.toHaveBeenCalled()` is the regression net against the oldest-sede fallback creeping back.

The existing invalid-filter tests still pass, but their expected `filtros.sedeId` changes from `null` to `filtros.sedeId ?? session.user.sedeActivaId`. Update those expectations to `"sede-activa"` where the test supplies no `sedeId`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/actions/reporte-actions.test.ts`
Expected: FAIL — `sede.findFirst` is still called and `filtros.sedeId` is the mock's `"sede-default"`.

- [ ] **Step 3: Rewrite the sede resolution**

In `src/app/actions/reporte-actions.ts`:

Change the `ReporteFiltrosAplicados` interface:

```ts
/** Filters actually applied, with the sede activa already substituted in. */
export interface ReporteFiltrosAplicados {
  desde: string;
  hasta: string;
  sedeId: string;
}
```

Delete the whole `resolveSedeId` function and its doc comment (including the now-unused `import type { TenantPrismaClient }` line if nothing else in the file uses it — check before removing).

In `getReporteRentabilidad`, replace the invalid-filters early return and the sede resolution:

```ts
  if (!parsed.success) {
    return {
      filtros: {
        desde: filtros.desde,
        hasta: filtros.hasta,
        sedeId: filtros.sedeId || session.user.sedeActivaId,
      },
      error: parsed.error.issues[0]?.message ?? "Filtros inválidos",
      totales: computeRentabilidad([]),
    };
  }

  const tenantDb = getTenantDb(session.user.tenantSchema);
  // No lookup: the sede activa comes from the validated session (Fase 1
  // backlog #21's rule, applied to sede state). An explicit sedeId lets an
  // ADMIN compare against another sede -- the design doc's "sede como
  // dimensión de filtro/comparación" (§5 módulo 12).
  const sedeId = parsed.data.sedeId || session.user.sedeActivaId;
  const aplicados: ReporteFiltrosAplicados = {
    desde: parsed.data.desde,
    hasta: parsed.data.hasta,
    sedeId,
  };
```

then **delete** the `if (!sedeId) { return { filtros: aplicados, error: null, totales: computeRentabilidad([]) }; }` block. Everything from `const rango = buildRangoFechas(...)` down is unchanged.

Apply the same three edits to `getReporteProductividad`: the invalid-filters `sedeId` becomes `filtros.sedeId || session.user.sedeActivaId`, the resolution becomes `const sedeId = parsed.data.sedeId || session.user.sedeActivaId;`, and the `if (!sedeId) { return { filtros: aplicados, error: null, filas: [] }; }` block is deleted.

- [ ] **Step 4: Add the sede selector to the page**

Replace the top of `src/app/(dashboard)/reportes/page.tsx` down to the end of the `<form>`:

```tsx
import {
  getReporteProductividad,
  getReporteRentabilidad,
  type ReporteFiltros,
} from "@/app/actions/reporte-actions";
import { listSedes } from "@/app/actions/sede-actions";
import { rangoMesActual } from "@/lib/reportes/rango-fechas";

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; sedeId?: string }>;
}) {
  const { desde, hasta, sedeId } = await searchParams;
  const porDefecto = rangoMesActual(new Date());
  const filtros: ReporteFiltros = {
    desde: desde || porDefecto.desde,
    hasta: hasta || porDefecto.hasta,
    sedeId: sedeId || undefined,
  };

  // Sequential, never Promise.all: all three go through requireRole, which
  // redirect()s by throwing (Fase 5 Task 9's deliberate choice).
  const rentabilidad = await getReporteRentabilidad(filtros);
  const productividad = await getReporteProductividad(filtros);
  const sedes = await listSedes();

  return (
    <main>
      <h1>Reportes</h1>

      <form method="get" action="/reportes">
        <label htmlFor="desde">Desde</label>
        <input id="desde" name="desde" type="date" defaultValue={filtros.desde} required />

        <label htmlFor="hasta">Hasta</label>
        <input id="hasta" name="hasta" type="date" defaultValue={filtros.hasta} required />

        {/*
          Fase 6: a real selector replaces Fase 5's hidden input. It defaults to
          whatever the actions resolved (the sede activa when the URL carries
          none), so an ADMIN can compare any sede without re-logging-in --
          reading another sede's numbers is safe in a way that operating in it
          is not.
        */}
        <label htmlFor="sedeId">Sede</label>
        <select id="sedeId" name="sedeId" defaultValue={rentabilidad.filtros.sedeId}>
          {sedes.map((sede) => (
            <option key={sede.id} value={sede.id}>
              {sede.nombre}
            </option>
          ))}
        </select>

        <button type="submit">Aplicar</button>
      </form>
```

Everything from `{rentabilidad.error ? ... }` onwards is unchanged.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/app/actions/reporte-actions.test.ts`
Expected: PASS — the pre-existing filter-validation and aggregation tests plus the four above.

- [ ] **Step 6: Full verification pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full unit suite green.

- [ ] **Step 7: Commit**

```bash
git add src/app/actions/reporte-actions.ts src/app/actions/reporte-actions.test.ts "src/app/(dashboard)/reportes/page.tsx"
git commit -m "fase6-task 18: default reportes to the sede activa and add a sede selector"
git push origin main
```

---

### Task 19: Dashboard header — sede activa, admin links, cambiar de sede

**Files:**
- Create: `src/app/(dashboard)/cambiar-sede-button.tsx`
- Create: `src/app/(dashboard)/cambiar-sede-button.test.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `session.user.sedeActivaNombre` and `session.user.role` from `requireSession()`.
- Produces: the header renders the literal `Sede: <nombre>`, a button labelled `Cambiar de sede`, and — for ADMIN only — nav links labelled `Sedes` and `Usuarios`. Task 20's e2e asserts all four literals.

The button is `SignOutButton` with different copy, on purpose: v1's way to change sede is to log in again (see Global Constraints for why a live JWT swap is deliberately out of scope). Signposting it as "Cambiar de sede" is what makes that acceptable rather than confusing.

- [ ] **Step 1: Write the failing test**

Create `src/app/(dashboard)/cambiar-sede-button.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSignOut = vi.fn();
vi.mock("next-auth/react", () => ({ signOut: (...args: unknown[]) => mockSignOut(...args) }));

import { CambiarSedeButton } from "./cambiar-sede-button";

describe("CambiarSedeButton", () => {
  beforeEach(() => {
    mockSignOut.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("sends the user back to the login page of the current tenant subdomain", async () => {
    render(<CambiarSedeButton />);

    await userEvent.click(screen.getByRole("button", { name: "Cambiar de sede" }));

    expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: `${window.location.origin}/login` });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/(dashboard)/cambiar-sede-button.test.tsx"`
Expected: FAIL — `Failed to resolve import "./cambiar-sede-button"`.

- [ ] **Step 3: Write the button**

Create `src/app/(dashboard)/cambiar-sede-button.tsx`:

```tsx
"use client";

import { signOut } from "next-auth/react";

/**
 * v1's way to change sede is to log in again: the sede lives in the JWT, and
 * swapping it live would mean introducing a SessionProvider plus a client
 * session hook and re-validating client-supplied data inside the jwt callback
 * -- new auth machinery this phase deliberately does not add (see the plan's
 * Global Constraints). Signposting the round trip is the honest v1 answer.
 *
 * `${window.location.origin}` is required, not decorative: with AUTH_URL set,
 * a bare "/login" callbackUrl resolves against a fixed origin and drops the
 * tenant subdomain. Same fix as SignOutButton, Fase 5 Task 11.
 */
export function CambiarSedeButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: `${window.location.origin}/login` })}
    >
      Cambiar de sede
    </button>
  );
}
```

- [ ] **Step 4: Wire the header**

Replace the whole of `src/app/(dashboard)/layout.tsx`:

```tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { requireSession } from "@/lib/auth/guards";
import { SignOutButton } from "./sign-out-button";
import { CambiarSedeButton } from "./cambiar-sede-button";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const esAdmin = session.user.role === "ADMIN";

  return (
    <div style={{ padding: "2rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <nav style={{ display: "flex", gap: "1rem" }}>
          <Link href="/clientes">Clientes</Link>
          <Link href="/ordenes">Órdenes</Link>
          <Link href="/bodegas">Bodegas</Link>
          <Link href="/proveedores">Proveedores</Link>
          <Link href="/repuestos">Repuestos</Link>
          <Link href="/entradas-mercancia">Entradas</Link>
          <Link href="/facturas">Facturas</Link>
          {esAdmin ? <Link href="/reportes">Reportes</Link> : null}
          {esAdmin ? <Link href="/sedes">Sedes</Link> : null}
          {esAdmin ? <Link href="/usuarios">Usuarios</Link> : null}
        </nav>
        <span>
          Sesión: {session.user.email} — {session.user.tenantSlug}
        </span>
        {/* The sede activa scopes everything below this header, so it is shown
            on every page rather than only on /sedes. */}
        <span>Sede: {session.user.sedeActivaNombre}</span>
        <CambiarSedeButton />
        <SignOutButton />
      </header>
      {children}
    </div>
  );
}
```

The `/sedes` and `/usuarios` links are cosmetic; the real boundary is `listSedes`/`listUsuariosConSedes` being `requireRole(["ADMIN"])`, exactly as with `/reportes` in Fase 5.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run "src/app/(dashboard)/cambiar-sede-button.test.tsx"`
Expected: PASS — 1 test.

- [ ] **Step 6: Full verification pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full unit suite green.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/cambiar-sede-button.tsx" "src/app/(dashboard)/cambiar-sede-button.test.tsx" "src/app/(dashboard)/layout.tsx"
git commit -m "fase6-task 19: show the sede activa and add the admin nav links"
git push origin main
```

---
### Task 20: e2e — the cross-sede isolation proof

The single most important behavioural claim of this phase is: **a técnico logged into Sede B never sees Sede A's data.** Every unit test in Tasks 13–18 asserts one `where` clause in isolation; only this spec proves the whole chain — login, session, scope filter, page — actually holds together against a real Postgres schema.

**Files:**
- Modify: `e2e/tenant-flow.spec.ts`

**Interfaces:**
- Consumes: everything built in Tasks 1–19. Uses the existing `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `E2E_TECNICO_EMAIL`, `E2E_TECNICO_PASSWORD`, `E2E_TECNICO_NOMBRE` constants from `e2e/global-setup.ts` — `global-setup.ts` itself needs **no change**, because Task 2 already makes `seedTenantUser` grant both users the default sede.
- Produces: no new exports.

- [ ] **Step 1: Add the sede selection to the two existing logins**

In `e2e/tenant-flow.spec.ts`, after the `Contraseña` fill in the opening ADMIN login (around line 14), insert:

```ts
  await page.getByLabel("Sede").selectOption({ label: "Sede principal" });
```

Do the same in the Fase 5 TECNICO login near the end of the spec (after its `Contraseña` fill, around line 245). At both points "Sede principal" is the only sede in the tenant, so the select would default to it anyway — being explicit is what makes the spec fail loudly if the selector ever disappears.

- [ ] **Step 2: Run the e2e to verify the existing flow still passes**

Run: `npx playwright test`
Expected: 2/2 passing. If the ADMIN login now fails, the sede gate is rejecting a legitimate login — stop and debug Task 2 or Task 6 before writing the new assertions.

Per `RULES.md` #2, do not sit waiting on the Playwright dev server. If it does not come up promptly, stop and ask.

- [ ] **Step 3: Append the Fase 6 section**

Add this at the very end of the existing test body, after the Fase 5 role-gate block that ends with the `"No tienes permiso para acceder a esa sección."` assertion:

```ts
  // --- Fase 6: gestión de sedes y aislamiento por sede activa ---

  // Back in as ADMIN, in Sede principal, to create a second sede.
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Correo").fill(E2E_ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(E2E_ADMIN_PASSWORD);
  await page.getByLabel("Sede").selectOption({ label: "Sede principal" });
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/clientes$/);

  // The header states which sede scopes everything below it.
  await expect(page.getByText("Sede: Sede principal")).toBeVisible();

  await page.getByRole("link", { name: "Sedes" }).click();
  await expect(page.getByRole("heading", { name: "Sedes", level: 1 })).toBeVisible();

  await page.getByLabel("Nombre", { exact: true }).fill("Sede norte");
  await page.getByLabel("Dirección", { exact: true }).fill("Calle 80 #10-20");
  await page.getByRole("button", { name: "Crear sede" }).click();
  await expect(page.getByRole("status")).toHaveText("Sede creada");
  await expect(page.getByRole("heading", { name: "Sede norte", level: 2 })).toBeVisible();

  // A sede with órdenes and bodegas cannot be deleted -- the RESTRICT guard.
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Eliminar Sede principal" }).click();
  await expect(page.getByRole("heading", { name: "Sede principal", level: 2 })).toBeVisible();

  // Assign the técnico to the new sede as well as the original one.
  await page.getByRole("link", { name: "Usuarios" }).click();
  await expect(page.getByRole("heading", { name: "Usuarios", level: 1 })).toBeVisible();

  await page.getByLabel(`Sede norte para ${E2E_TECNICO_NOMBRE}`).check();
  await page.getByRole("button", { name: `Guardar sedes de ${E2E_TECNICO_NOMBRE}` }).click();
  await expect(page.getByRole("status")).toHaveText("Sedes actualizadas");

  // --- The isolation proof: the same técnico, in the other sede, sees nothing ---

  await page.getByRole("button", { name: "Cambiar de sede" }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Correo").fill(E2E_TECNICO_EMAIL);
  await page.getByLabel("Contraseña").fill(E2E_TECNICO_PASSWORD);
  await page.getByLabel("Sede").selectOption({ label: "Sede norte" });
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/clientes$/);
  await expect(page.getByText("Sede: Sede norte")).toBeVisible();

  // Clientes stay tenant-wide by design -- Juan Pérez is still here.
  await expect(page.getByRole("link", { name: "Juan Pérez" })).toBeVisible();

  // Everything sede-scoped is empty: the ABC123 orden, its factura, the
  // bodegas and FRN-001 all live in Sede principal.
  await page.goto("/ordenes");
  await expect(page.getByRole("link", { name: /ABC123/ })).toHaveCount(0);

  await page.goto("/bodegas");
  await expect(page.getByText("Bodega principal")).toHaveCount(0);
  await expect(page.getByText("Bodega norte")).toHaveCount(0);

  await page.goto("/repuestos");
  await expect(page.getByText(/FRN-001/)).toHaveCount(0);

  await page.goto("/facturas");
  await expect(page.getByText(/Factura #1/)).toHaveCount(0);

  // Back in Sede principal, the same técnico sees all of it again -- proof the
  // rows were filtered by sede, not deleted or hidden by some other accident.
  await page.getByRole("button", { name: "Cambiar de sede" }).click();
  await page.getByLabel("Correo").fill(E2E_TECNICO_EMAIL);
  await page.getByLabel("Contraseña").fill(E2E_TECNICO_PASSWORD);
  await page.getByLabel("Sede").selectOption({ label: "Sede principal" });
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/clientes$/);

  await page.goto("/ordenes");
  await expect(page.getByRole("link", { name: /ABC123/ })).toBeVisible();

  await page.goto("/repuestos");
  await expect(page.getByText(/FRN-001.*stock: 18/)).toBeVisible();

  // --- ADMIN: bypasses UsuarioSede, and compares sedes on /reportes ---

  await page.getByRole("button", { name: "Cambiar de sede" }).click();
  await page.getByLabel("Correo").fill(E2E_ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(E2E_ADMIN_PASSWORD);
  // The ADMIN was never assigned to Sede norte on /usuarios, and gets in anyway.
  await page.getByLabel("Sede").selectOption({ label: "Sede norte" });
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/clientes$/);
  await expect(page.getByText("Sede: Sede norte")).toBeVisible();

  await page.getByRole("link", { name: "Reportes" }).click();
  await expect(page.getByText("Facturas emitidas: 0")).toBeVisible();
  await expect(page.getByText("Total facturado: 0")).toBeVisible();

  // Switching the report's sede selector reaches the other sede's numbers --
  // read-only cross-sede comparison, without changing the sede activa.
  await page.getByLabel("Sede").selectOption({ label: "Sede principal" });
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByText("Facturas emitidas: 1")).toBeVisible();
  await expect(page.getByText("Total facturado: 140.18")).toBeVisible();
  await expect(page.getByText("Sede: Sede norte")).toBeVisible();

  // --- A técnico still cannot reach the sede admin surfaces ---

  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await page.getByLabel("Correo").fill(E2E_TECNICO_EMAIL);
  await page.getByLabel("Contraseña").fill(E2E_TECNICO_PASSWORD);
  await page.getByLabel("Sede").selectOption({ label: "Sede principal" });
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/clientes$/);

  await expect(page.getByRole("link", { name: "Sedes" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Usuarios" })).toHaveCount(0);

  await page.goto("/sedes");
  await expect(page).toHaveURL(/\/login\?error=forbidden/);
  await expect(page.getByRole("alert").filter({ hasText: "No tienes permiso" })).toHaveText(
    "No tienes permiso para acceder a esa sección.",
  );
```

Three locator notes, each avoiding a strict-mode violation this project has already hit twice (Fase 2 Task 14, Fase 5 Task 11):

- `getByLabel("Nombre", { exact: true })` on `/sedes` — without `exact`, it also matches `EditarSedeForm`'s "Nombre de Sede principal".
- `getByRole("heading", { name: ..., level: N })` — `/sedes` renders `<h1>Sedes</h1>` and one `<h2>` per sede; the level disambiguates.
- `getByRole("alert").filter({ hasText: ... })` — Next.js's `__next-route-announcer__` is also `role="alert"` after a client-side navigation.

The `page.once("dialog", ...)` before the delete click is defensive: `deleteSedeAction` throws, which surfaces as a Next.js error rather than a browser dialog, but the handler costs nothing and prevents a hang if a future edit adds a `confirm()`.

- [ ] **Step 4: Run the e2e suite**

Run: `npx playwright test`
Expected: 2/2 passing.

- [ ] **Step 5: Full verification pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; the full unit suite green.

Per `RULES.md` #1, if any command fails, make at most one correction attempt, then stop and report.

- [ ] **Step 6: Commit**

```bash
git add e2e/tenant-flow.spec.ts
git commit -m "fase6-task 20: extend e2e with the cross-sede isolation proof"
git push origin main
```

---

## Self-Review

**Spec coverage**

| Scope item (from the user's binding scope for Fase 6) | Task(s) |
| --- | --- |
| 1. Sede CRUD — create/edit/delete sedes | 8, 9, 10 |
| 2. `UsuarioSede` bridge table | 1 |
| 2. ADMIN sees/operates across all sedes; TECNICO/RECEPCION confined to assigned | 4 (bypass), 9/11/12 (ADMIN-only surfaces), 18 (ADMIN cross-sede reports), 20 (proof) |
| 2. Assigning users to sedes | 11, 12 |
| 3. Selector de sede en login | 5 (credential + session), 6 (validation), 7 (form + page) |
| 4. Scoping de queries por sede activa — órdenes | 13, 14 |
| 4. Scoping — bodegas/repuestos/entradas | 15, 16 |
| 4. Scoping — facturas/pagos | 17 |
| 4. Scoping — reportes (Fase 5) | 18 |
| 5. Transferencias de inventario entre sedes | Explicitly OUT of scope, with the schema-level blocker and the four prerequisites documented in Global Constraints |
| Freshly-provisioned tenant can log in day one | 2 |
| Existing tenants' users are not locked out | 1 (backfill `INSERT ... SELECT`) |
| No `Plan`/`maxSedes` anywhere | Global Constraints; no task creates one |
| Sede activa visible to the user | 19 |
| Way to change sede | 19 (re-login, signposted); live JWT swap explicitly out of scope with reasoning |
| Behavioural proof of isolation | 20 |

**Complete inventory of pre-existing call sites migrated (grep-verified against the real tree)**

| File | Call site | Was | Becomes | Task |
| --- | --- | --- | --- | --- |
| `orden-actions.ts:85` | `createOrdenAction` | `sede.findFirst({ orderBy: { createdAt: "asc" } })` | `session.user.sedeActivaId` | 13 |
| `orden-actions.ts:34` | `listOrdenes` | no filter | `scopeOrden` | 13 |
| `orden-actions.ts:44` | `listOrdenesByVehiculo` | `{ vehiculoId }` | `+ scopeOrden` | 13 |
| `orden-actions.ts:50` | `getOrden` | `findUnique({ id })` | `findFirst({ id, ...scopeOrden })` | 13 |
| `orden-actions.ts:56` | `listTecnicos` | `{ role: "TECNICO" }` | `+ sedes: { some: { sedeId } }` | 13 |
| `orden-actions.ts:127` | `updateEstadoOrdenAction` | `findUnique({ id })` | `findFirst({ id, ...scopeOrden })` | 13 |
| `item-orden-actions.ts:34` | `addItemOrdenAction` orden lookup | `findUnique` | `findFirst + scopeOrden` | 14 |
| `item-orden-actions.ts:51` | `addItemOrdenAction` repuesto lookup | `findUnique` | `findFirst + scopeRepuesto` | 14 |
| `item-orden-actions.ts:84` | `deleteItemOrdenAction` | `findUnique` | `findFirst + scopeOrden` | 14 |
| `mano-de-obra-actions.ts:33` | `addManoDeObraAction` | `findUnique` | `findFirst + scopeOrden` | 14 |
| `mano-de-obra-actions.ts:67` | `deleteManoDeObraAction` | `findUnique` | `findFirst + scopeOrden` | 14 |
| `dvi-actions.ts:33` | `updateDviChecklistAction` | `findUnique` | `findFirst + scopeOrden` | 14 |
| `dvi-actions.ts:78` | `addDviFotoAction` orden lookup | `findUnique` | `findFirst + scopeOrden` | 14 |
| `dvi-actions.ts:91` | `addDviFotoAction` dvi lookup | `findUnique({ ordenId })` | unchanged (unique FK on an already-scoped orden) | 14 |
| `dvi-actions.ts:119` | `deleteDviFotoAction` | `findUnique` | `findFirst + scopeOrden` | 14 |
| `bodega-actions.ts:40` | `createBodegaAction` | `sede.findFirst({ orderBy: ... })` | `session.user.sedeActivaId` | 15 |
| `bodega-actions.ts:15` | `listBodegas` | no filter | `scopeBodega` | 15 |
| `bodega-actions.ts:21` | `getBodega` | `findUnique` | `findFirst + scopeBodega` | 15 |
| `bodega-actions.ts:70` | `updateBodegaAction` | `update({ id })` | `updateMany({ id, ...scopeBodega })` | 15 |
| `bodega-actions.ts:83` | `deleteBodegaAction` | `delete({ id })` | `deleteMany({ id, ...scopeBodega })` | 15 |
| `repuesto-actions.ts:44` | `listRepuestos` | no filter | `scopeRepuesto` | 16 |
| `repuesto-actions.ts:50` | `listRepuestoOptions` | optional `bodegaId` | `+ scopeRepuesto` | 16 |
| `repuesto-actions.ts:60` | `getRepuesto` | `findUnique` | `findFirst + scopeRepuesto` | 16 |
| `repuesto-actions.ts:84` | `createRepuestoAction` | unchecked `bodegaId` | bodega ownership check | 16 |
| `repuesto-actions.ts:119` | `updateRepuestoAction` | `update({ id })`, unchecked `bodegaId` | `updateMany + scopeRepuesto` + bodega check | 16 |
| `repuesto-actions.ts:144` | `deleteRepuestoAction` | `delete({ id })` | `deleteMany({ id, ...scopeRepuesto })` | 16 |
| `entrada-mercancia-actions.ts:23` | `listEntradas` | no filter | `scopeEntrada` | 16 |
| `entrada-mercancia-actions.ts:29` | `getEntrada` | `findUnique` | `findFirst + scopeEntrada` | 16 |
| `entrada-mercancia-actions.ts:52` | `createEntradaMercanciaAction` | unchecked `bodegaId` | bodega ownership check | 16 |
| `entrada-mercancia-actions.ts:86-87` | `addEntradaItemAction` | two `findUnique`s | two scoped `findFirst`s | 16 |
| `factura-actions.ts:28` | `listFacturas` | optional `estado` | `+ scopeFactura` | 17 |
| `factura-actions.ts:38` | `getFactura` | `findUnique` | `findFirst + scopeFactura` | 17 |
| `factura-actions.ts:60` | `crearFacturaAction` | `findUnique` | `findFirst + scopeOrden` | 17 |
| `factura-actions.ts:114` | stock decrement inside `$transaction` | `updateMany({ id, stockActual: { gte } })` | unchanged (reachable only via an already-scoped orden) | 17 |
| `pago-actions.ts:34` | `registrarPagoAction` | `findUnique` | `findFirst + scopeFactura` | 17 |
| `pago-actions.ts:59` | `findUniqueOrThrow` inside `$transaction` | unchanged (same id, already scoped, same transaction) | — | 17 |
| `reporte-actions.ts:36-40` | `resolveSedeId` helper | `sede.findFirst({ orderBy: ... })` | deleted; `parsed.data.sedeId \|\| session.user.sedeActivaId` | 18 |
| `reporte-actions.ts:61` | `getReporteRentabilidad` | `resolveSedeId(...)` | session default | 18 |
| `reporte-actions.ts:141` | `getReporteProductividad` | `resolveSedeId(...)` | session default | 18 |
| `(dashboard)/reportes/page.tsx:40` | hidden `sedeId` input | hidden input | real `<select>` | 18 |
| `scripts/provision-tenant.ts:49` | default sede creation | unchanged — no users exist at provisioning time | — | 2 (verified, not modified) |
| `scripts/seed-tenant-user.ts:23` | user upsert | no sede grant | `usuarioSede.upsert` | 2 |

Deliberately **not** migrated: `cliente-actions.ts`, `vehiculo-actions.ts`, `historial-actions.ts`, `proveedor-actions.ts` — tenant-wide by design (Global Constraints).

**Placeholder scan:** no TBD, no TODO, no "add validation here", no "similar to Task N". Every code step carries the literal content to write; every command carries its expected output. Task 14 is the one task that describes a transformation applied to seven near-identical functions rather than printing all seven bodies — the transformation is shown as literal code, and every call site it applies to is enumerated by file and line in the table above, so nothing is left to guess.

**Type consistency**

- `UsuarioSede`'s field names (`usuarioId`, `sedeId`, `createdAt`) and its composite-key alias `usuarioId_sedeId` are defined in Task 1 and used with those exact spellings in Tasks 2, 4, 11 and 13.
- `Usuario.sedes` (the relation name) is defined in Task 1 and used as `sedes: { some: { sedeId } }` in Task 13's `listTecnicos` and as `sedes: { select: { sedeId: true } }` in Task 11's `listUsuariosConSedes`.
- `SedeActiva { id, nombre }` and `resolveSedeActiva(tenantDb, usuarioId, role, sedeId)` are defined in Task 4 and consumed with that exact argument order in Task 6.
- `sedeActivaId` / `sedeActivaNombre` are declared in Task 5 and read as `session.user.sedeActivaId` in Tasks 9, 11, 13–19 and as `session.user.sedeActivaNombre` in Task 19 only.
- `SedeOption { id, nombre }` and `listSedesDelTenant()` are defined in Task 7 and used only by `LoginForm`'s `sedes` prop in that same task.
- `scopeOrden` / `scopeBodega` / `scopeRepuesto` / `scopeEntrada` / `scopeFactura` are defined once in Task 3 and imported under those exact names in Tasks 13–18. No task re-implements any of them inline.
- `SedeFormState { error, success }` (Task 9) is the state type consumed by both forms in Task 10. `UsuarioSedesFormState` and `UsuarioConSedes` (Task 11) are consumed by Task 12 under those names, and `UsuarioConSedes.sedeIds` is the exact field Task 12's `defaultChecked={usuario.sedeIds.includes(sede.id)}` reads.
- `ReporteFiltrosAplicados.sedeId` changes from `string | null` to `string` in Task 18, and Task 18's own page edit is the only consumer (`defaultValue={rentabilidad.filtros.sedeId}`) — no other task reads that field.
- Error strings asserted verbatim across tasks: `"El nombre es obligatorio"` (8, 9), `"Selecciona al menos una sede"` (8, 11), `"Correo, contraseña o sede incorrectos"` (7), `"Bodega no encontrada en tu sede activa."` (15), `"La bodega seleccionada no pertenece a tu sede activa."` (16), `"Repuesto no encontrado en tu sede activa."` (16), `"Orden no encontrada"` (13, 14, 17 — reusing Fase 2's existing copy on purpose, so no new string is introduced for the cross-sede case), `"No puedes eliminar la única sede del taller."` / `"No puedes eliminar una sede con órdenes o bodegas asociadas."` / `"No puedes eliminar una sede con usuarios asignados. Reasígnalos primero."` (9).
- UI literals asserted by Task 20's e2e and produced by earlier tasks: `Sedes` / `Crear sede` / `Sede creada` / `Eliminar Sede principal` (Task 10), `Usuarios` / `Sede norte para Tec E2E` / `Guardar sedes de Tec E2E` / `Sedes actualizadas` (Task 12), `Sede` label on the login select (Task 7), `Sede: <nombre>` and `Cambiar de sede` (Task 19), `Sede` label on the reportes select (Task 18).

**Two cross-checks worth flagging to the reviewer of each task**

1. Task 20's `"Total facturado: 140.18"` and `"Facturas emitidas: 1"` are the *existing* Fase 5 fixture numbers, re-asserted after the sede filter is applied to `Sede principal`. If either changes, the sede filter has altered which facturas the report sees — which is exactly what those two lines are there to catch.
2. Task 1's backfill and Task 2's grant overlap for a tenant provisioned *after* this migration: the backfill inserts nothing (no users yet) and `seedTenantUser` does the grant. For a tenant provisioned *before*, the backfill does the work and `seedTenantUser`'s `upsert` is a no-op on re-seed. Both paths converge on exactly one row per user per default sede, with no duplicate-key failure, because the composite PK makes the `upsert` idempotent.

