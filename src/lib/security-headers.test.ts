import { describe, expect, it } from "vitest";
import { construirCsp, securityHeaders } from "./security-headers";

function comoMapa(): Record<string, string> {
  return Object.fromEntries(securityHeaders().map((h) => [h.key, h.value]));
}

describe("securityHeaders", () => {
  it("define las cabeceras básicas de endurecimiento", () => {
    const mapa = comoMapa();

    expect(mapa["X-Frame-Options"]).toBe("DENY");
    expect(mapa["X-Content-Type-Options"]).toBe("nosniff");
    expect(mapa["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(mapa["Strict-Transport-Security"]).toBe("max-age=31536000; includeSubDomains");
    expect(mapa["Permissions-Policy"]).toBe("camera=(self), microphone=(), geolocation=()");
  });

  it("no incluye la CSP: la pone src/proxy.ts con un nonce por petición", () => {
    expect(comoMapa()["Content-Security-Policy"]).toBeUndefined();
  });
});

describe("construirCsp", () => {
  it("CSP de producción: scripts solo con nonce + strict-dynamic, sin unsafe-inline ni unsafe-eval", () => {
    expect(construirCsp("abc123", false)).toBe(
      "default-src 'self'; " +
        "script-src 'self' 'nonce-abc123' 'strict-dynamic'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' blob: data:; " +
        "font-src 'self'; " +
        "object-src 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self'; " +
        "frame-ancestors 'none'",
    );
  });

  it("CSP de desarrollo añade unsafe-eval (lo usa React para depurar)", () => {
    expect(construirCsp("abc123", true)).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic' 'unsafe-eval';");
  });
});
