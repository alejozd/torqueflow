import { describe, expect, it } from "vitest";
import { extractTenantSlug, isValidTenantSlug } from "./subdomain";

describe("extractTenantSlug", () => {
  it("extracts the first-level subdomain as the tenant slug", () => {
    expect(extractTenantSlug("taller-perez.zdevs.uk", "zdevs.uk")).toBe("taller-perez");
  });

  it("returns null for the bare apex domain (no tenant)", () => {
    expect(extractTenantSlug("zdevs.uk", "zdevs.uk")).toBeNull();
  });

  it("returns null for a second-level nested subdomain (unsupported by design)", () => {
    expect(extractTenantSlug("taller-perez.torqueflow.zdevs.uk", "zdevs.uk")).toBeNull();
  });

  it("returns null for a reserved subdomain like www", () => {
    expect(extractTenantSlug("www.zdevs.uk", "zdevs.uk")).toBeNull();
  });

  it("strips the port before matching", () => {
    expect(extractTenantSlug("taller-perez.zdevs.uk:3000", "zdevs.uk")).toBe("taller-perez");
  });

  it("returns null for a host on a completely different domain", () => {
    expect(extractTenantSlug("evil.com", "zdevs.uk")).toBeNull();
  });

  it("returns null for a missing host header", () => {
    expect(extractTenantSlug(null, "zdevs.uk")).toBeNull();
    expect(extractTenantSlug(undefined, "zdevs.uk")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(extractTenantSlug("Taller-Perez.ZDEVS.UK", "zdevs.uk")).toBe("taller-perez");
  });
});

describe("isValidTenantSlug", () => {
  it("accepts a valid lowercase alphanumeric-with-hyphens slug", () => {
    expect(isValidTenantSlug("taller-perez")).toBe(true);
  });

  it.each(["www", "app", "api", "admin"])("rejects the reserved word %s", (word) => {
    expect(isValidTenantSlug(word)).toBe(false);
  });

  it("rejects a slug with uppercase letters", () => {
    expect(isValidTenantSlug("Taller-Perez")).toBe(false);
  });

  it("rejects a slug starting with a digit", () => {
    expect(isValidTenantSlug("1taller")).toBe(false);
  });

  it("rejects a slug containing a dot", () => {
    expect(isValidTenantSlug("taller.perez")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidTenantSlug("")).toBe(false);
  });
});
