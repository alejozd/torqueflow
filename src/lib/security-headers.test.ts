import { describe, expect, it } from "vitest";
import { securityHeaders } from "./security-headers";

function comoMapa(esDesarrollo: boolean): Record<string, string> {
  return Object.fromEntries(securityHeaders(esDesarrollo).map((h) => [h.key, h.value]));
}

describe("securityHeaders", () => {
  it("define las cabeceras básicas de endurecimiento", () => {
    const mapa = comoMapa(false);

    expect(mapa["X-Frame-Options"]).toBe("DENY");
    expect(mapa["X-Content-Type-Options"]).toBe("nosniff");
    expect(mapa["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(mapa["Strict-Transport-Security"]).toBe("max-age=31536000; includeSubDomains");
    expect(mapa["Permissions-Policy"]).toBe("camera=(self), microphone=(), geolocation=()");
  });

  it("CSP de producción: solo mismo origen, sin unsafe-eval, sin framing", () => {
    expect(comoMapa(false)["Content-Security-Policy"]).toBe(
      "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' blob: data:; " +
        "font-src 'self'; " +
        "object-src 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self'; " +
        "frame-ancestors 'none'",
    );
  });

  it("CSP de desarrollo añade unsafe-eval (lo necesita el HMR de Next)", () => {
    expect(comoMapa(true)["Content-Security-Policy"]).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval';");
  });
});
