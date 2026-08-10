import { describe, expect, it } from "vitest";
import { extractTenantSlug } from "./subdomain";

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
