export interface CabeceraHttp {
  key: string;
  value: string;
}

/**
 * Static response headers applied to every route from next.config.ts. Lives
 * in src/ (not inline in next.config.ts) so vitest can cover it; next.config
 * imports it by relative path because the "@/" alias is not available there.
 *
 * The CSP is NOT here: it carries a per-request nonce, so src/proxy.ts builds
 * it with construirCsp() on every page request. Sending a second, static CSP
 * from here would only add a redundant policy the browser also enforces.
 */
export function securityHeaders(): CabeceraHttp[] {
  return [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Browsers ignore HSTS on plain HTTP, so this only takes effect behind HTTPS.
    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    // camera=(self) keeps the DVI photo capture working.
    { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  ];
}

/**
 * The nonce-based CSP from Next's own CSP guide: a script runs only if it
 * carries this request's nonce (Next stamps it on its own scripts) or was
 * loaded by one that does ('strict-dynamic') -- an injected <script> or
 * inline handler is blocked. Styles keep 'unsafe-inline': React's
 * style={{...}} attributes and the UI libraries' injected styles need it, and
 * a style cannot execute code. upgrade-insecure-requests is deliberately
 * absent: it would break plain-HTTP local runs on 127.0.0.1.
 */
export function construirCsp(nonce: string, esDesarrollo: boolean): string {
  return [
    "default-src 'self'",
    // React uses eval in development only, to rebuild server error stacks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${esDesarrollo ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
