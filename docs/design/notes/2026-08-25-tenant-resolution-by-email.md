# Design note: tenant resolution by email (Fase 10)

Date: 2026-08-25
Supersedes: docs/design/notes/2026-08-09-tenant-resolution-edge-split.md
Related: docs/design/2026-08-02-taller-saas-multitenant-design.md §4, §4.1

## Why this exists

The original design (§4.1) resolved the tenant from a first-level subdomain
(`<slug>.zdevs.uk`), one per taller. The product direction changed: instead
of a subdomain per tenant, TorqueFlow exposes a single entry URL
(`torqueflow.zdevs.uk`) for every tenant, and the tenant is determined by the
email the user logs in with. This removes the DNS/Cloudflare-cert dependency
that originally motivated the first-level-subdomain constraint (§4.1), and
simplifies onboarding a new taller to "seed a user" — no DNS/Tunnel step.

## The model

- New table `public.TenantUserEmail` (`email` PK, `tenantId` FK) — a global
  email → tenant index the previous per-tenant-schema `Usuario.email`
  uniqueness couldn't provide on its own. Populated by `seedTenantUser()`
  and by every write path in `src/app/actions/usuario-actions.ts`
  (create/update/delete), via `src/lib/tenant/tenant-user-email.ts`'s
  `claimTenantUserEmail`/`releaseTenantUserEmail`. `claimTenantUserEmail`
  never silently overwrites an email already claimed by a *different*
  tenant — it throws `TenantUserEmailConflictError` instead, so a typo or a
  stale form can never hand one tenant's login identity to another.
- `authorizeCredentials()` (`src/lib/auth/authorize-credentials.ts`) looks
  up the tenant by email first, then verifies the password inside that
  tenant's schema — the same order-of-checks security property as before (a
  wrong password never triggers a sede lookup), just keyed by email instead
  of by the `Host` header.
- Login stays a single step (email + password only, no pre-login sede
  picker). A sede is auto-selected only when there is exactly one
  unambiguous candidate (`resolveSedeInicial` in
  `src/lib/auth/sede-access.ts`: every sede in the tenant for an ADMIN, or
  only the user's own `UsuarioSede` assignments otherwise); when there is
  more than one candidate, the session is minted with an empty
  `sedeActivaId` and completed afterward at `/seleccionar-sede`, via
  NextAuth's `unstable_update()`.
- `requireSession()` (`src/lib/auth/guards.ts`) re-checks the tenant on
  every request by `session.user.tenantSchema`
  (`getTenantBySchema` in `src/lib/tenant/resolve-tenant.ts`) — not by any
  Host-derived value, because there is no Host-derived value anymore.
- `src/middleware.ts`, `extractTenantSlug`/`RESERVED_SUBDOMAINS`
  (formerly in `src/lib/tenant/subdomain.ts`), and the Host-based
  `resolveTenant()` are gone entirely. `isValidTenantSlug` survives in
  `subdomain.ts`, simplified to format-only validation — a tenant slug is
  now just an internal identifier, not a DNS label.

## Consequence for future contributors

- Email is unique **globally** now, not per tenant. A tenant slug no longer
  has to avoid DNS-reserved words (`www`, `app`, `api`, `admin`, ...) since
  there is no subdomain routing left to collide with.
- Any new code path that creates, updates, or deletes a `Usuario` row
  **must** go through `claimTenantUserEmail`/`releaseTenantUserEmail` (or
  `seedTenantUser()`, which already does). A `Usuario` row not reflected in
  `TenantUserEmail` can never log in.
- Do not resurrect Host-header-based tenant resolution. The single-URL
  model is the product decision, not a temporary state.
