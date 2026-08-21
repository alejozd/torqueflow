import { extractTenantSlug } from "@/lib/tenant/subdomain";

/**
 * NextAuth's default redirect callback rejects any absolute URL that
 * doesn't start with `baseUrl` -- and when AUTH_URL is set, `baseUrl` is a
 * single fixed origin, ignoring the actual tenant subdomain of the
 * request that triggered the redirect (e.g. a sign-out's callbackUrl).
 * This resolves the same way NextAuth would for a relative url, but for
 * an absolute url it trusts any host that is the bare baseDomain or a
 * valid tenant subdomain of it (same pure check the Edge middleware
 * already uses to validate incoming Host headers) -- never an arbitrary
 * external host, so this cannot become an open redirect.
 */
export function resolveRedirectUrl(url: string, baseUrl: string, baseDomain: string): string {
  if (url.startsWith("/")) return `${baseUrl}${url}`;

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return baseUrl;
  }

  const isTrustedHost = target.hostname === baseDomain || extractTenantSlug(target.hostname, baseDomain) !== null;
  return isTrustedHost ? url : baseUrl;
}
