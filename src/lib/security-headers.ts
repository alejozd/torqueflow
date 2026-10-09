export interface CabeceraHttp {
  key: string;
  value: string;
}

/**
 * Response headers applied to every route from next.config.ts. Lives in src/
 * (not inline in next.config.ts) so vitest can cover it; next.config imports
 * it by relative path because the "@/" alias is not available there.
 *
 * The CSP is the static, no-nonce variant from Next's own CSP guide: scripts
 * still need 'unsafe-inline' for Next's inline bootstrap, but nothing can be
 * loaded from, posted to, or framed by another origin. A nonce-based CSP
 * (which drops 'unsafe-inline') needs a proxy and dynamic rendering -- a
 * separate change. upgrade-insecure-requests is deliberately absent: it would
 * break anyone reaching the app over plain HTTP on the LAN.
 */
export function securityHeaders(esDesarrollo: boolean): CabeceraHttp[] {
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${esDesarrollo ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  return [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Browsers ignore HSTS on plain HTTP, so this only takes effect behind HTTPS.
    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    // camera=(self) keeps the DVI photo capture working.
    { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  ];
}
