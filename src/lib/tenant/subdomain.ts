const VALID_SLUG_FORMAT = /^[a-z][a-z0-9-]*$/;

/**
 * Pure format validation for a tenant slug at provisioning time: lowercase
 * alphanumeric-with-hyphens, starting with a letter. Fase 10: slugs are just
 * an internal identifier now (no subdomain routing), so there is no reserved
 * word to collide with anymore.
 */
export function isValidTenantSlug(slug: string): boolean {
  return VALID_SLUG_FORMAT.test(slug);
}
