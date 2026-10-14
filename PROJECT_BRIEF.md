# TorqueFlow — Project Brief

> Portable context document for AI tools picking up this project cold (Qwen Code, Jules, Codex, or any assistant other than the one that has been driving this session). Read this before touching code. Cross-check anything load-bearing against the actual repo — this project moves fast and this file can drift.

## 1. Executive summary

TorqueFlow is a multi-tenant SaaS platform for automotive repair shops ("talleres"/"servitecas"), rebuilt from scratch after a legacy Delphi system (`Imperio`) failed on user adoption, not on technical merit. It replaces that legacy logic entirely — the design was opened to what the 2026 market actually expects (Tekmetric, AutoLeap, Orderry-class competitors), not constrained by the old system's data model.

**Current state: the 9 v1 phases (Fase 1–9) are complete, and so are the "módulos faltantes" roadmap phases 15–22 and 24 (Fases 21, 22 and 24 were the last three merged). Fase 23 (customer portal) is deliberately deferred together with DIAN electronic invoicing, and Fase 25 is the roadmap's leftover bucket (fleets, AI assistant, RUNT lookup, accounting export) plus DIAN, which is planned separately.** No phase is active right now; the roadmap's suggested order and per-item status live in `docs/superpowers/plans/2026-10-10-roadmap-modulos-faltantes.md`, and the handoff document for any AI picking this up cold is **`docs/TRASPASO-AGENTES.md`** (state, mandatory workflow, money invariants, deploy procedure and known traps). **Since Fase 15 the branch convention is one branch per phase**, not direct-to-`main`: `faseN-<slug>` is created from `main`, tasks are committed on it (`faseN-task X: …`, pushed after each one) and it is merged back with `git merge --no-ff` once its final review and fix round are done — no PRs, no CI gate. Nothing lands on `main` directly except `docs:`-only commits.

Each phase went through: a written plan (`writing-plans` skill) → task-by-task implementation (subagent-driven or inline, per `RULES.md`) → task-scoped review → a final whole-branch review with a fix round before the `--no-ff` merge. Fases 1–9 are recorded in full in `.superpowers/sdd/progress.md`; **from Fase 15 on the per-phase record is the spec/plan document itself** (`docs/superpowers/plans/2026-10-10-faseN-*.md`), which is kept updated with the review findings and what the fix round changed.

## 2. Tech stack (verified against `package.json`)

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js (App Router, full-stack) | **16.4.0** |
| UI | React | 19.2.8 |
| ORM | Prisma | **6.19.3 — pinned exact, not `^`** (both `prisma` and `@prisma/client`) |
| Database | PostgreSQL | schema-per-tenant (see §3) |
| Auth | NextAuth | `^5.0.0-beta.32` (v5 beta; `next-auth@latest` on npm still resolves v4 — do not blindly upgrade) |
| Validation | Zod | `^4.4.3` |
| Email | Nodemailer | `^8.0.11` |
| Password hashing | bcryptjs | `^3.0.3` |
| Styling | Tailwind CSS | `^4` |
| Test runner | Vitest + Testing Library (jsdom) | — |
| E2E | Playwright | `^1.62.1` |
| Script runner | tsx | `^4.23.12` |

No separate backend repo — Next.js unifies API and UI in one deployable. Hosting target: Docker Compose on the user's own Ubuntu server, exposed via Cloudflare Tunnel (see design doc §3, §8 for backup policy).

## 3. Multi-tenant architecture

**Model: one PostgreSQL schema per tenant**, inside a single `torqueflow` database (chosen over shared-schema-with-`tenant_id` and database-per-tenant — see design doc §4 for the full tradeoff). A `public` schema holds global tables (`Tenant`, `Plan`, `SuperAdmin`); each tenant gets its own schema (`taller_perez`, `taller_gomez`, ...) from `prisma/tenant/schema.prisma`. `prisma/schema.prisma` is the `public`-schema model.

**Tenant resolution: by email index, one URL for everyone (Fase 10 replaced the old `<slug>.zdevs.uk` subdomain-per-tenant scheme, and with it the `middleware.ts` / `TENANT_SLUG_HEADER` edge layer).** The login form takes only email + password: no tenant picker, no `Host`-derived slug, so there is no header to spoof and Cloudflare's wildcard-SSL limitation stopped being a constraint. The tenant is fixed once, at login:
- **Login (`src/lib/auth/authorize-credentials.ts`)** — the email is looked up in the global `public.tenant_user_emails` index (populated by `claimTenantUserEmail()` in `src/lib/tenant/tenant-user-email.ts`, which refuses to hand one email to a second tenant). That row's tenant fixes `schemaName` / `slug` / `estado` for the session; a `SUSPENDIDO` tenant fails exactly like a wrong password. Only then does it verify the password with bcrypt inside `getTenantDb(tenant.schemaName)` and resolve the initial sede.
- **Session (`src/auth.ts`)** — the resolved `role`, `tenantSlug`, `tenantSchema`, `sedeActivaId` and `sedeActivaNombre` ride in the JWT; `unstable_update` is what later completes a session that signed in with no auto-resolved sede.
- **Per request (`src/lib/auth/guards.ts`)** — `requireSession()` re-checks that schema against `public.Tenant` through `getTenantBySchema()` (`src/lib/tenant/resolve-tenant.ts`, the Fase 10 replacement for the slug-based `resolveTenant()`, no longer reachable from a `Host` header) and redirects with `?error=tenant-mismatch` if the tenant row is gone, `?error=tenant-suspendido` if it was suspended after login, `?error=usuario-suspendido` if the user was deactivated, or to `/seleccionar-sede` while the session still has no `sedeActivaId`.
- **Edge (`src/proxy.ts`)** — no tenant logic at all: it only stamps the per-request CSP nonce (Next 16 renamed `middleware.ts` to `proxy.ts`). Tenant Prisma clients are LRU-cached in `src/lib/db/tenant-client.ts`, capped at `MAX_CACHED_TENANT_CLIENTS = 20`.

**Two fully independent NextAuth v5 instances, deliberately not sharing code or types:**
- **Tenant auth** (`src/auth.ts` → `src/lib/auth/authorize-credentials.ts`) — Credentials provider; `authorize()` resolves the tenant from the email index *before* any tenant-schema lookup (the tenant is fixed once, at login, not re-derived per request), scopes via `getTenantDb(tenant.schemaName)`, verifies via bcrypt. Session/JWT carry `role`, `tenantSlug`, `tenantSchema`, `sedeActivaId`, `sedeActivaNombre` (typed via `src/types/next-auth.d.ts`'s global module augmentation).
- **Super-admin auth** (`src/lib/super-admin/auth.ts`) — own `basePath` (`/api/superadmin/auth`), own session cookie name (`superadmin-session-token`), own Credentials provider against the global `SuperAdmin` table. Does **not** use the tenant session type — a narrow local `SuperAdminSession {id,email,nombre}` type is used everywhere instead (`src/lib/super-admin/guards.ts`), because the ambient `User`/`Session` augmentation from `next-auth.d.ts` is global and would otherwise let TypeScript silently allow reading tenant-only fields that don't exist on a super-admin session.

**Multi-tenant isolation is application-level**, enforced through a single choke point: `requireSession()`/`requireRole()` (`src/lib/auth/guards.ts`) re-validate the session's `tenantSchema` against `public.Tenant` (via `getTenantBySchema`), and are the only source of truth every action file relies on — every DB-touching function builds its client from `getTenantDb(session.user.tenantSchema)` and no action file re-derives the schema independently (that duplication was removed in Fase 1 backlog #21; the cross-tenant session bypass it fixed was a Critical finding of Fase 1's final review).

**Sedes (multi-location):** the full multi-sede data model (`Sede`, `sede_id` on relevant entities) was built into every module from Fase 2 onward, but the UI/selector/enforcement was deliberately activated later, in Fase 6 — see design doc §5 module 12 for the reasoning (avoid a disruptive schema migration later; the real target shop already operates multiple locations).

## 4. Key decisions — settled, do not re-litigate

Verified against current code/config, not just transcribed:

- **Email is SMTP-only, via the client's own mail server (Nodemailer)** — no WhatsApp/SMS integration exists or is planned for notifications (`src/lib/email/`, `src/app/actions/smtp-actions.ts`). This is despite the original market-research design doc (§2, §5) listing WhatsApp/SMS as an expected feature — that was superseded during implementation (Fase 8) in favor of email-only.
- **Prisma pinned to exact `6.19.3`** in both `dependencies` and `devDependencies` — no `^`. Prisma 7 was evaluated and explicitly declined (ESM/Node ≥20.19 migration risk), recorded as binding for all future Prisma work.
- **SMTP password encrypted with AES-256-GCM** — `src/lib/crypto/secret-box.ts` (`cifrarSecreto`/`descifrarSecreto`), used by `smtp-actions.ts`. The browser never receives the password or its ciphertext, only a `passwordConfigurada` boolean.
- **Reminder rule: 5,000 km OR 6 months since last service, whichever comes first, with a 90-day cooldown** between reminders for the same vehicle — implemented in `src/lib/recordatorios/`.
- **Cron endpoint authenticated via `CRON_SECRET`** — `src/app/api/cron/recordatorios/route.ts`.
- **IVA (VAT): fixed at a single rate** used throughout billing (`OrdenTrabajo`/facturación, Fase 4). Verify the exact literal against `src/lib/validation/` or the billing calculation module before changing it — treat 19% as the expected fixed value per prior direction, but confirm the constant in code before relying on it in a change.
- **No feature-flag-style plan gating** — `Plan` enforcement (`maxUsuarios`, `maxSedes`) is purely numeric (`src/lib/planes/limites.ts`), no `hasDVI`/`hasWhatsapp`-style boolean flags were ultimately implemented despite being in the original design doc §9 table.
- **Direct-to-`main` development, no branches/PRs** — standing convention across all 9 phases, re-confirmed every phase in `RULES.md` and the progress ledger. **Changed 2026-10-10:** from Fase 15 on, each phase lives on its own branch `faseN-<slug>` and is merged `--no-ff` into `main` after its final review (no PRs). Roadmap: `docs/superpowers/plans/2026-10-10-roadmap-modulos-faltantes.md`.
- **Session lifetime**: check `git log --oneline -10` for a `fase9-fix:` commit changing `session.maxAge` in `src/auth.ts` before assuming session behavior — a change from the previous default (30-day JWT, no `maxAge` set) to a short-lived (1h) JWT with silent renewal was in progress as of this document's writing. Do not assume it has landed; verify.

## 5. Code structure (2-3 levels, not exhaustive)

```
src/
  app/
    (dashboard)/          # tenant-authenticated routes: clientes, vehiculos, ordenes,
                           # citas, bodegas, proveedores, repuestos, entradas-mercancia,
                           # facturas, reportes, sedes, usuarios, configuracion-smtp
    actions/               # server actions, one file per domain (cliente-actions.ts, ...)
    api/
      auth/[...nextauth]/  # tenant NextAuth route handler
      superadmin/auth/[...nextauth]/  # super-admin NextAuth route handler
      cron/recordatorios/  # CRON_SECRET-gated reminder job
      uploads/[...path]/   # auth-gated DVI photo file serving
    login/                 # tenant login page + form
    superadmin/            # super-admin login + dashboard (own layout/SessionProvider)
  lib/
    auth/                  # guards.ts (requireSession/requireRole), authorize-credentials,
                           # verify-credentials, sede-access, resolve-redirect
    super-admin/           # parallel auth stack for the super-admin instance
    tenant/                # email→tenant index, slug format, resolve-tenant (schema lookup)
    db/                    # tenant-client.ts (LRU-cached Prisma clients), public-client.ts
    planes/                # plan limit enforcement (maxUsuarios/maxSedes)
    recordatorios/         # maintenance reminder rule engine
    email/                 # SMTP config storage + sending
    crypto/                # secret-box.ts (AES-256-GCM)
    validation/             # one zod schema file per domain
    orden/                 # estado-transitions, mutable-guard
    dvi/                   # DVI checklist constants
    storage/               # local file storage for DVI photos
  types/next-auth.d.ts      # global module augmentation for the TENANT session shape
prisma/
  schema.prisma            # public schema (Tenant, Plan, SuperAdmin)
  tenant/schema.prisma      # per-tenant schema template
e2e/                        # Playwright specs + global setup/teardown (real Postgres, real tenants)
scripts/                    # provision-tenant, seed-tenant-user, seed-super-admin (+ CLI wrappers)
docs/design/                # architecture design doc + notes
.superpowers/sdd/           # phase plans, task briefs/reports, progress ledger, review diffs
```

## 6. Established conventions

- **Atomic commits per completed task**, immediate push to `main` (`RULES.md` §3). Commit message format: `fase{N}-task X: description` during an active phase; `fase{N}-fix:` for a scoped debt/bug fix tied to a specific phase after the fact; `docs:` for documentation-only commits.
- **No automatic retries** on a failing test/command — one correction attempt max, then stop and report (`RULES.md` §1).
- **`requireSession()`/`requireRole([...])`** (`src/lib/auth/guards.ts`) is the single authorization choke point for every tenant action — reads require `requireSession()`, writes require `requireRole([...])`. Every DB-touching function derives its tenant schema from the already-validated session (`getTenantDb(session.user.tenantSchema)`), never by re-resolving the tenant independently.
- **Sede scoping**: entities with `sede_id` are always filtered by the session's `sedeActivaId` in list/read paths (Fase 6 enforcement); `ADMIN` role sees across all sedes.
- **`formData.get(field) ?? ""` pattern** on every required `z.string()` form field — `FormData.get()` returns `null` for an absent field, and Zod's `.min(1)` gives a generic type-mismatch error (not the custom message) for `null` specifically. Does not apply to `z.coerce.number()` fields.
- **`<form noValidate>` with `required` kept on inputs** — needed so React 19's server-action submission isn't blocked by native HTML5 validation on browser-driven tests, while keeping the `required` attribute for accessibility/UX.
- **Testing**: co-located `*.test.ts`/`*.test.tsx` files next to the code they test. Unit/integration tests run against a real Postgres instance where relevant (not fully mocked) — see `tenant-client.test.ts` self-provisioning its own fixture schema. E2E specs drive a single URL (`http://localhost:3000` — one URL, no tenant subdomain since Fase 10), provisioning/tearing down disposable tenants per spec.
- **`tsc --noEmit` and the full test suite run only at the end of a task**, not mid-development (`RULES.md` §4).
- **Never leak a full `Usuario`/DB row to a client component** — always `select` the needed fields (`{id, nombre}`, etc.), never `include: { relation: true }` when the relation carries a password hash or similar. This was a Critical finding twice (Fase 2's `listTecnicos`, and flagged again for `historial-actions.ts`'s `autor` relation).
- **Debt from a previous phase is out of scope during an active phase** (`RULES.md` §7) — noted in passing, revisited only when explicitly prioritized.

## 7. Roadmap

**Fases 1–9 (v1)** — per the design doc §11 and `.superpowers/sdd/progress.md`:

1. **Fase 1** — Núcleo: auth, multi-tenant foundation, Clientes/Vehículos/Historial. ✅
2. **Fase 2** — Órdenes de trabajo + Inspección Vehicular Digital (DVI). ✅
3. **Fase 3** — Inventario, repuestos y proveedores. ✅
4. **Fase 4** — Facturación y pagos. ✅
5. **Fase 5** — Dashboard y reportes básicos. ✅
6. **Fase 7** — Agendamiento de citas + recordatorios de mantenimiento preventivo. ✅ *(implemented before Fase 6 in execution order — see ledger)*
7. **Fase 6** — Gestión de sedes (multi-sede UI/enforcement activation). ✅
8. **Fase 8** — Notificaciones automáticas al cliente (email/SMTP, not WhatsApp/SMS — see §4). ✅
9. **Fase 9** — Panel de super-admin + planes y niveles de suscripción, usuarios/roles CRUD. ✅ — 579/582 unit tests passing (3 skipped: 1 known shared-schema migration-contention flake, clean in isolation), 2/2 e2e in isolation, `tsc --noEmit` clean.

**Fases 15–25 ("módulos faltantes")** — roadmap and per-phase scope in `docs/superpowers/plans/2026-10-10-roadmap-modulos-faltantes.md`; each phase on its own branch, merged `--no-ff` when closed:

- **Fase 15** (`fase15-vehiculo-vencimientos`) — complete vehicle data (SOAT, tecnomecánica, VIN, carro/moto) + expiry reminders. ✅ merged `ea21123`
- **Fase 16** (`fase16-gastos-rentabilidad`) — operating expenses with editable categories and recurring templates, plus real profitability (billed − expenses, break-even). ✅ merged `b565eb6`
- **Fase 17** (`fase17-caja-cartera-anticipos`) — daily cash drawer (opening/arqueo/closing), receivables ageing, and customer deposits applied when invoicing. ✅ merged `3553d30`
- **Fase 18** (`fase18-catalogo-servicios`) — service catalog (base labour price) and kits (service + parts), applicable to an order or a quote; a kit never crosses sedes. ✅ merged `8d6383f` — 204 files / 1531 tests passing, `tsc --noEmit` clean, `next build` OK, migration applied to `taller_dev` and `taller_dev_reference`
- **Fase 19** (`fase19-equipo-tecnico`) — technical team and payroll: per-technician pay scheme (a percentage of the labour they produced, a fixed base per period, or both) plus a shop-level liquidation frequency (weekly / fortnightly / monthly) the ADMIN chooses; generating a period freezes what each technician produced (labour lines attributed to whoever did each job), and paying one creates a real expense under a system category, so it shows up in the cash drawer and in profitability with no new code there. Adjustments, voiding and reactivating are explicit, audited and guarded against double payment across frequencies. Hours were deliberately deferred (shops pay per activity, not per hour). ✅ merged `7ae3992` — 214 files / 1695 tests passing, `tsc --noEmit` clean, `next build` OK, migration applied to `taller_dev` and `taller_dev_reference`
- **Fase 20** (`fase20-importar-excel`) — Excel import (roadmap item 9): one `.xlsx` workbook with a sheet per entity (clientes, vehículos, repuestos, servicios) and a downloadable template. It **only creates** — anything that already exists is reported with its key and never overwritten — imports the valid rows and returns the rejected ones with sheet, row, column and reason. Colombian formats are normalized before validation (comma decimals, `dd/mm/aaaa` dates, headers with accents), and a part's initial stock is recorded as a merchandise entry in the bodega chosen at upload time (with a proveedor, so it stays traceable). Adds two runtime dependencies (`read-excel-file`, `write-excel-file`), so the deploy needs `npm install`/`npm ci` before the build; **no schema change**. ✅ merged `e1e36c5` — 227 files / 1806 tests passing, `tsc --noEmit` clean, `next build` OK, `migrate status` up to date
- **Fase 21** (`fase21-recepcion-garantias`) — intake and warranties (roadmap items 12–14): the vehicle's intake state (odometer and fuel level) plus a **damage diagram** marked as zone rows over an SVG silhouette that follows the vehicle type (car or motorbike), so a mark is a comparable record instead of a free drawing. Delivery is a single printable **acta** per order carrying that intake state, signed either on screen (canvas → PNG) or by uploading a photo of the paper copy, and **signing and moving to `ENTREGADA` happen in one transaction** because `ENTREGADA` is immutable — signing later is allowed once, and the order cannot be delivered through the generic state change. Warranties are registered per covered line (labour or part) with a date and/or mileage limit and consulted for the whole shop from the vehicle's file, with the validity computed from those limits. ✅ merged `65efee4` — 239 files / 1915 tests passing, `tsc --noEmit` clean, `eslint` clean, `next build` OK, two migrations applied to `taller_dev` and `taller_dev_reference`
- **Fase 22** (`fase22-flujo-taller`) — shop-floor flow (roadmap items 15–17): the shop can now rank work and see what stalled. Orders carry a **priority** (four levels, Normal by default) that is audited when it changes and that sorts the list and each board column; the already-existing read-only board became **actionable** (native drag & drop plus a keyboard/touch "Move to…" menu, both calling the same state-change action, never offering *Delivered* because delivering means signing the acta) and dropping into *Cancelled* asks for confirmation. A **stalled-order alert** marks orders in progress with no activity for a configurable number of days — activity counts the order itself **and** what has been loaded into it (items, labour, DVI photos, damage marks), because the order's own timestamp only moves when someone touches its header — and *Finished but not delivered* alerts separately. Alerts show on the Inicio as a card and in the list as a filter pill plus a KPI, with no email or in-app bell (deliberate: the shop looks at the Inicio). ✅ merged `06f4aae` — 248 files / 1988 tests passing, `tsc --noEmit` clean, `eslint` clean, `next build` OK, migration applied to `taller_dev` and `taller_dev_reference`
- **Fase 23** (`fase23-portal-cliente`, **deferred**) — customer portal (roadmap items 10 and 20): a public link for the customer to follow their order without logging in, plus a post-sale survey and a Google review invite. It was measured before starting and deliberately deferred on 2026-10-12 together with DIAN electronic invoicing: it would be the project's **first surface without a session**, its **first anonymous write** and its **first stored credential with expiry and revocation**, roughly 30–40 % bigger than Fases 21–22 with the uncertainty concentrated in two questions (where the token lives, and whether the link shows DVI photos, since `/api/uploads` requires a session today). No branch and no code were created. Measurement: `docs/superpowers/plans/2026-10-12-fase23-portal-cliente.md`
- **Fase 24** (`fase24-mostrador-compras`) — counter and purchases (roadmap items 22–24): the shop can sell stock over the counter, owe its suppliers properly, and hand an accountant a spreadsheet. A **counter sale** is its own document (not an invoice: `Factura.ordenId` is mandatory and unique, and the cash count reaches the branch through the order), with a branch, an optional customer — without one the sale must be paid — and the stock decremented under a `stockActual >= cantidad` guard inside the same transaction that creates the sale, so it cannot oversell. **Returns** are their own numbered, audited document that gives the money back, puts the stock back and, when the sale was on credit, pays down that debt first: only the excess leaves the drawer. Sales sum and returns subtract in the **cash count**, and **every movement of money now requires an open till** — closing a gap inherited from Fase 17, where a payment taken with the drawer closed was recorded but appeared in no count at all; the same hole in advances and in cash expenses was closed too. **Payables** are born from the goods entry (`entradaId` unique, so one debt per entry and no double counting) and are settled with guarded, atomic payments; "paid" is always derived from the balance. Four reports (receivables, payables, today's sales, cash counts) download as `.xlsx` from routes that take the branch from the session, never from the URL. ✅ merged `62924f8` — 258 files / 2068 tests passing, `tsc --noEmit` clean, `eslint` clean, `next build` OK, migration applied to `taller_dev` and `taller_dev_reference`
- **Fase de consolidación** (`fase-consolidacion`) — fixes everything the review of phases 18–24 found (1 high, 4 medium, several low) and removes friction the owner asked about. Two shop options in Configuración, both **off** by default: *require a signed acta to deliver* and *use cash-drawer control*; with control on, only **cash** needs an open drawer (one rule, `exigirCajaParaEfectivo`). An invoiced order can now be delivered (the acta no longer depends on the invoice) and can be signed later. Counter sales are ADMIN/RECEPCION only and take part price and name from inventory; supplier debt is recomputed under row locks as total − payments; Excel import caps the **decompressed** size at 40 MB. The Inicio's shop-alerts card shows per-reason counters linked to the order filter and at most 5 rows; sales and cash-count exports take a date range (max 366 days). **Payroll was simplified**: the period table is live and a liquidation document is born **when it is paid** (snapshot + expense in one transaction, adjustment entered in the pay dialog); cancelling deletes the expense and leaves the period payable again — no more generate/regenerate/reactivate — and periods now cut at Bogotá midnight. ✅ merged `dedc201` — 266 files / 2123 tests passing, `tsc --noEmit` clean, `eslint` clean, `next build` OK, migration `20261018120000_consolidacion` applied to `taller_dev` and `taller_dev_reference`
- **Fase 25** — the backlog (fleets/RUNT/AI assistant/accounting export) and gets re-planned together with DIAN and the deferred Fase 23.

Explicitly out of scope for v1 (design doc §6, YAGNI): automated subscription billing (Stripe), native mobile app, external accounting integrations (QuickBooks), multi-language support.

Known accepted technical debt (see `.superpowers/sdd/progress.md` Fase 9 summary for the full list): role demotion/deletion doesn't invalidate an already-issued JWT until it expires naturally (being addressed — check `git log` per §4); an intermittent Playwright e2e flake under 2-worker concurrency (infra timing, not application logic); a handful of Minor findings from final reviews, documented per-phase.

## 8. Key reference files

- **Design doc**: `docs/design/2026-08-02-taller-saas-multitenant-design.md` — architecture rationale, multi-tenancy decision, plan/pricing table, full roadmap reasoning.
- **Progress ledger**: `.superpowers/sdd/progress.md` — chronological, phase-by-phase record, but it **stops at 2026-10-10 (Fases 1–9 plus the pre-roadmap work)**; it has no entries for Fases 15–21. For those, the per-phase spec in `docs/superpowers/plans/` is the record, and `git log --oneline main` is the source of truth for hashes.
- **Phase plans**: `docs/superpowers/plans/YYYY-MM-DD-torqueflow-phaseN-*.md`.
- **Task briefs/reports**: `.superpowers/sdd/task-N-brief.md` / `task-N-report.md` (per active-phase task, numbering resets each phase).
- **Operating rules**: `RULES.md` (commit/retry/reporting discipline), `AGENTS.md` (Next.js version-drift warning — this Next.js version has breaking changes vs. training data, read `node_modules/next/dist/docs/` before assuming API behavior).
- **This file**: `PROJECT_BRIEF.md` — keep it updated when a phase starts/completes or a §4 decision changes; it is not auto-generated and will drift if forgotten.
