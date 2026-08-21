import { describe, expect, it, vi, beforeEach } from "vitest";

const mockResolveTenant = vi.fn();
vi.mock("@/lib/tenant/resolve-tenant", () => ({
  resolveTenant: () => mockResolveTenant(),
}));

const mockFindMany = vi.fn();
const mockGetTenantDb = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: (...args: unknown[]) => {
    mockGetTenantDb(...args);
    return { sede: { findMany: mockFindMany } };
  },
}));

import { listSedesDelTenant } from "./login-sedes";

describe("listSedesDelTenant", () => {
  beforeEach(() => {
    mockResolveTenant.mockReset();
    mockGetTenantDb.mockReset();
    mockFindMany.mockReset();
  });

  it("returns an empty list when the subdomain resolves to no tenant", async () => {
    mockResolveTenant.mockResolvedValue(null);

    await expect(listSedesDelTenant()).resolves.toEqual([]);
    expect(mockGetTenantDb).not.toHaveBeenCalled();
  });

  it("lists the tenant's sedes by nombre, selecting only id and nombre", async () => {
    mockResolveTenant.mockResolvedValue({ slug: "taller-perez", schemaName: "taller_perez" });
    mockFindMany.mockResolvedValue([{ id: "sede-1", nombre: "Sede principal" }]);

    const result = await listSedesDelTenant();

    expect(result).toEqual([{ id: "sede-1", nombre: "Sede principal" }]);
    expect(mockGetTenantDb).toHaveBeenCalledWith("taller_perez");
    expect(mockFindMany).toHaveBeenCalledWith({
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
  });
});
