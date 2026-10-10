import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: vi.fn(),
}));
const mockUpsert = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({ configuracionTaller: { upsert: mockUpsert, findUnique: vi.fn() } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { guardarDiasAvisoAction } from "./configuracion-taller-actions";

const inicial = { error: null, success: false };

describe("guardarDiasAvisoAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockUpsert.mockReset().mockResolvedValue({});
  });

  it("exige ADMIN", async () => {
    const fd = new FormData();
    fd.set("diasAvisoVencimiento", "15");
    await guardarDiasAvisoAction(inicial, fd);
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
  });

  it("guarda con upsert sobre el singleton", async () => {
    const fd = new FormData();
    fd.set("diasAvisoVencimiento", "15");
    const r = await guardarDiasAvisoAction(inicial, fd);
    expect(r).toEqual({ error: null, success: true });
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { id: "singleton" },
      create: { id: "singleton", diasAvisoVencimiento: 15 },
      update: { diasAvisoVencimiento: 15 },
    });
  });

  it.each(["0", "91", "abc", ""])("rechaza %s", async (valor) => {
    const fd = new FormData();
    fd.set("diasAvisoVencimiento", valor);
    const r = await guardarDiasAvisoAction(inicial, fd);
    expect(r.success).toBe(false);
    expect(r.error).toBe("Ingresa un número de días entre 1 y 90");
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
