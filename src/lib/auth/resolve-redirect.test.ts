import { describe, expect, it } from "vitest";
import { resolveRedirectUrl } from "./resolve-redirect";

const BASE_URL = "http://localhost:3000";
const BASE_DOMAIN = "localhost";

describe("resolveRedirectUrl", () => {
  it("resolves a relative url against baseUrl", () => {
    expect(resolveRedirectUrl("/login", BASE_URL, BASE_DOMAIN)).toBe(
      "http://localhost:3000/login",
    );
  });

  it("trusts an absolute url on a valid tenant subdomain of baseDomain, even though it does not start with baseUrl", () => {
    const url = "http://taller-e2e-smoke.localhost:3000/login";
    expect(resolveRedirectUrl(url, BASE_URL, BASE_DOMAIN)).toBe(url);
  });

  it("trusts an absolute url on the bare baseDomain itself", () => {
    const url = "http://localhost:3000/login";
    expect(resolveRedirectUrl(url, BASE_URL, BASE_DOMAIN)).toBe(url);
  });

  it("falls back to baseUrl for a completely untrusted external host", () => {
    const url = "http://evil.com/login";
    expect(resolveRedirectUrl(url, BASE_URL, BASE_DOMAIN)).toBe(BASE_URL);
  });

  it("falls back to baseUrl for a reserved-subdomain host rejected by extractTenantSlug", () => {
    const url = "http://www.localhost:3000/login";
    expect(resolveRedirectUrl(url, BASE_URL, BASE_DOMAIN)).toBe(BASE_URL);
  });

  it("falls back to baseUrl for a malformed url string without throwing", () => {
    const url = "not a url and not a relative path";
    expect(() => resolveRedirectUrl(url, BASE_URL, BASE_DOMAIN)).not.toThrow();
    expect(resolveRedirectUrl(url, BASE_URL, BASE_DOMAIN)).toBe(BASE_URL);
  });
});
