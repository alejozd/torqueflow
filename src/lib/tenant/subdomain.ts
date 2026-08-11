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

const VALID_SLUG_FORMAT = /^[a-z][a-z0-9-]*$/;

/**
 * Pure validation for a tenant slug at provisioning time: must be
 * lowercase alphanumeric-with-hyphens (starting with a letter) and must
 * not collide with a reserved subdomain that `extractTenantSlug` always
 * rejects — otherwise the tenant would be provisioned but permanently
 * unreachable via its subdomain.
 */
export function isValidTenantSlug(slug: string): boolean {
  return VALID_SLUG_FORMAT.test(slug) && !RESERVED_SUBDOMAINS.has(slug);
}
