import { describe, expect, it, vi } from "vitest";

const mockFindUnique = vi.fn();
vi.mock("@/lib/db/public-client", () => ({
  publicDb: { tenant: { findUnique: (...args: unknown[]) => mockFindUnique(...args) } },
}));

import { obtenerLimitesPlan } from "./limites";

describe("obtenerLimitesPlan", () => {
  it("returns the tenant's plan limits, looked up by tenantSchema", async () => {
    mockFindUnique.mockResolvedValue({ plan: { maxUsuarios: 3, maxSedes: 1 } });

    const limites = await obtenerLimitesPlan("taller_perez");

    expect(limites).toEqual({ maxUsuarios: 3, maxSedes: 1 });
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { schemaName: "taller_perez" },
      select: { plan: { select: { maxUsuarios: true, maxSedes: true } } },
    });
  });

  it("passes through null limits (Avanzado, sin límite práctico) unchanged", async () => {
    mockFindUnique.mockResolvedValue({ plan: { maxUsuarios: null, maxSedes: null } });

    const limites = await obtenerLimitesPlan("taller_perez");

    expect(limites).toEqual({ maxUsuarios: null, maxSedes: null });
  });
});
