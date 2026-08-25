import { describe, expect, it, vi, beforeEach } from "vitest";

const mockFindUnique = vi.fn();
vi.mock("@/lib/db/public-client", () => ({
  publicDb: { tenant: { findUnique: (...args: unknown[]) => mockFindUnique(...args) } },
}));

import { getTenantBySchema } from "./resolve-tenant";

describe("getTenantBySchema", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
  });

  it("looks up the tenant by schemaName, not by any Host-derived slug", async () => {
    mockFindUnique.mockResolvedValue({
      slug: "taller-perez",
      schemaName: "taller_perez",
      estado: "ACTIVO",
    });

    const tenant = await getTenantBySchema("taller_perez");

    expect(mockFindUnique).toHaveBeenCalledWith({ where: { schemaName: "taller_perez" } });
    expect(tenant).toEqual({ slug: "taller-perez", schemaName: "taller_perez", estado: "ACTIVO" });
  });

  it("returns null when no Tenant row matches the schemaName", async () => {
    mockFindUnique.mockResolvedValue(null);

    const tenant = await getTenantBySchema("schema-borrado");

    expect(tenant).toBeNull();
  });
});
