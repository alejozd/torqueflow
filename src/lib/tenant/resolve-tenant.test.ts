import { describe, expect, it, vi, beforeEach } from "vitest";

const mockHeaders = vi.fn();
vi.mock("next/headers", () => ({ headers: () => mockHeaders() }));

const mockFindUnique = vi.fn();
vi.mock("@/lib/db/public-client", () => ({
  publicDb: { tenant: { findUnique: (...args: unknown[]) => mockFindUnique(...args) } },
}));

import { resolveTenant } from "./resolve-tenant";
import { TENANT_SLUG_HEADER } from "./constants";

describe("resolveTenant", () => {
  beforeEach(() => {
    mockHeaders.mockReset();
    mockFindUnique.mockReset();
  });

  it("returns null when the middleware did not tag the request with a slug", async () => {
    mockHeaders.mockReturnValue(new Headers());

    const result = await resolveTenant();

    expect(result).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns null when the slug does not match any Tenant row", async () => {
    const h = new Headers();
    h.set(TENANT_SLUG_HEADER, "no-such-tenant");
    mockHeaders.mockReturnValue(h);
    mockFindUnique.mockResolvedValue(null);

    const result = await resolveTenant();

    expect(result).toBeNull();
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { slug: "no-such-tenant" } });
  });

  it("returns the slug and schemaName when the Tenant row exists", async () => {
    const h = new Headers();
    h.set(TENANT_SLUG_HEADER, "taller-perez");
    mockHeaders.mockReturnValue(h);
    mockFindUnique.mockResolvedValue({
      id: "1",
      slug: "taller-perez",
      schemaName: "taller_perez",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await resolveTenant();

    expect(result).toEqual({ slug: "taller-perez", schemaName: "taller_perez" });
  });
});
