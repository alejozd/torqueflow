import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, proxy } from "./proxy";

function nonceDe(csp: string | null): string | undefined {
  return csp?.match(/'nonce-([^']+)'/)?.[1];
}

describe("proxy (CSP con nonce)", () => {
  it("pone la CSP con nonce en la respuesta y la reenvía a Next en la petición (de ahí la toma para sus scripts)", () => {
    const respuesta = proxy(new NextRequest("http://127.0.0.1:3025/ordenes"));

    const cspRespuesta = respuesta.headers.get("content-security-policy");
    const cspPeticion = respuesta.headers.get("x-middleware-request-content-security-policy");
    const nonce = nonceDe(cspRespuesta);

    expect(nonce).toBeTruthy();
    expect(cspRespuesta).toContain("'strict-dynamic'");
    expect(cspRespuesta).not.toContain("'unsafe-inline'; style");
    expect(nonceDe(cspPeticion)).toBe(nonce);
    expect(respuesta.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
  });

  it("genera un nonce distinto en cada petición", () => {
    const a = nonceDe(proxy(new NextRequest("http://x/")).headers.get("content-security-policy"));
    const b = nonceDe(proxy(new NextRequest("http://x/")).headers.get("content-security-policy"));

    expect(a).not.toBe(b);
  });

  it("no corre en API, assets estáticos ni prefetches", () => {
    const [matcher] = config.matcher;

    expect(matcher.source).toBe("/((?!api|_next/static|_next/image|favicon.ico).*)");
    expect(matcher.missing).toEqual([
      { type: "header", key: "next-router-prefetch" },
      { type: "header", key: "purpose", value: "prefetch" },
    ]);
  });
});
