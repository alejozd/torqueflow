import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveSedeActiva } from "./sede-access";
import type { TenantPrismaClient } from "@/lib/db/tenant-client";

const mockSedeFindUnique = vi.fn();
const mockUsuarioSedeFindUnique = vi.fn();

const tenantDb = {
  sede: { findUnique: mockSedeFindUnique },
  usuarioSede: { findUnique: mockUsuarioSedeFindUnique },
} as unknown as TenantPrismaClient;

describe("resolveSedeActiva", () => {
  beforeEach(() => {
    mockSedeFindUnique.mockReset().mockResolvedValue({ id: "sede-1", nombre: "Sede principal" });
    mockUsuarioSedeFindUnique.mockReset().mockResolvedValue(null);
  });

  it("returns null without touching the database when sedeId is empty", async () => {
    const result = await resolveSedeActiva(tenantDb, "u1", "ADMIN", "");

    expect(result).toBeNull();
    expect(mockSedeFindUnique).not.toHaveBeenCalled();
  });

  it("returns null when the sede does not exist in this tenant", async () => {
    mockSedeFindUnique.mockResolvedValue(null);

    const result = await resolveSedeActiva(tenantDb, "u1", "ADMIN", "sede-fantasma");

    expect(result).toBeNull();
    expect(mockUsuarioSedeFindUnique).not.toHaveBeenCalled();
  });

  it("lets an ADMIN into any sede of the tenant without a UsuarioSede row", async () => {
    const result = await resolveSedeActiva(tenantDb, "u1", "ADMIN", "sede-1");

    expect(result).toEqual({ id: "sede-1", nombre: "Sede principal" });
    expect(mockUsuarioSedeFindUnique).not.toHaveBeenCalled();
  });

  it("lets a TECNICO into a sede they are assigned to", async () => {
    mockUsuarioSedeFindUnique.mockResolvedValue({ usuarioId: "u1", sedeId: "sede-1" });

    const result = await resolveSedeActiva(tenantDb, "u1", "TECNICO", "sede-1");

    expect(result).toEqual({ id: "sede-1", nombre: "Sede principal" });
    expect(mockUsuarioSedeFindUnique).toHaveBeenCalledWith({
      where: { usuarioId_sedeId: { usuarioId: "u1", sedeId: "sede-1" } },
      select: { sedeId: true },
    });
  });

  it("refuses a TECNICO who has no assignment for that sede", async () => {
    mockUsuarioSedeFindUnique.mockResolvedValue(null);

    const result = await resolveSedeActiva(tenantDb, "u1", "TECNICO", "sede-1");

    expect(result).toBeNull();
  });

  it("refuses a RECEPCION who has no assignment for that sede", async () => {
    mockUsuarioSedeFindUnique.mockResolvedValue(null);

    const result = await resolveSedeActiva(tenantDb, "u1", "RECEPCION", "sede-1");

    expect(result).toBeNull();
  });
});
