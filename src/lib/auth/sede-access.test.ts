import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveSedeActiva, resolveSedeInicial, listSedesDisponibles } from "./sede-access";
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

describe("resolveSedeInicial", () => {
  const mockSedeFindMany = vi.fn();
  const mockUsuarioSedeFindMany = vi.fn();
  const tenantDbInicial = {
    sede: { findMany: mockSedeFindMany },
    usuarioSede: { findMany: mockUsuarioSedeFindMany },
  } as unknown as TenantPrismaClient;

  beforeEach(() => {
    mockSedeFindMany.mockReset();
    mockUsuarioSedeFindMany.mockReset();
  });

  it("auto-selects the tenant's only sede for an ADMIN", async () => {
    mockSedeFindMany.mockResolvedValue([{ id: "sede-1", nombre: "Sede principal" }]);

    const result = await resolveSedeInicial(tenantDbInicial, "u1", "ADMIN");

    expect(result).toEqual({ id: "sede-1", nombre: "Sede principal" });
    expect(mockUsuarioSedeFindMany).not.toHaveBeenCalled();
  });

  it("returns null for an ADMIN when the tenant has more than one sede", async () => {
    mockSedeFindMany.mockResolvedValue([
      { id: "sede-1", nombre: "Sede principal" },
      { id: "sede-2", nombre: "Sede norte" },
    ]);

    const result = await resolveSedeInicial(tenantDbInicial, "u1", "ADMIN");

    expect(result).toBeNull();
  });

  it("returns null for an ADMIN when the tenant has no sede at all", async () => {
    mockSedeFindMany.mockResolvedValue([]);

    const result = await resolveSedeInicial(tenantDbInicial, "u1", "ADMIN");

    expect(result).toBeNull();
  });

  it("auto-selects a TECNICO's only assigned sede", async () => {
    mockUsuarioSedeFindMany.mockResolvedValue([{ sede: { id: "sede-1", nombre: "Sede principal" } }]);

    const result = await resolveSedeInicial(tenantDbInicial, "u1", "TECNICO");

    expect(result).toEqual({ id: "sede-1", nombre: "Sede principal" });
    expect(mockUsuarioSedeFindMany).toHaveBeenCalledWith({
      where: { usuarioId: "u1" },
      select: { sede: { select: { id: true, nombre: true } } },
    });
    expect(mockSedeFindMany).not.toHaveBeenCalled();
  });

  it("returns null for a TECNICO with more than one assigned sede", async () => {
    mockUsuarioSedeFindMany.mockResolvedValue([
      { sede: { id: "sede-1", nombre: "Sede principal" } },
      { sede: { id: "sede-2", nombre: "Sede norte" } },
    ]);

    const result = await resolveSedeInicial(tenantDbInicial, "u1", "TECNICO");

    expect(result).toBeNull();
  });

  it("returns null for a RECEPCION with no assigned sede", async () => {
    mockUsuarioSedeFindMany.mockResolvedValue([]);

    const result = await resolveSedeInicial(tenantDbInicial, "u1", "RECEPCION");

    expect(result).toBeNull();
  });
});

describe("listSedesDisponibles", () => {
  const mockSedeFindMany = vi.fn();
  const mockUsuarioSedeFindMany = vi.fn();
  const tenantDbListado = {
    sede: { findMany: mockSedeFindMany },
    usuarioSede: { findMany: mockUsuarioSedeFindMany },
  } as unknown as TenantPrismaClient;

  beforeEach(() => {
    mockSedeFindMany.mockReset();
    mockUsuarioSedeFindMany.mockReset();
  });

  it("lists every sede in the tenant for an ADMIN", async () => {
    mockSedeFindMany.mockResolvedValue([
      { id: "sede-1", nombre: "Sede principal" },
      { id: "sede-2", nombre: "Sede norte" },
    ]);

    const result = await listSedesDisponibles(tenantDbListado, "u1", "ADMIN");

    expect(result).toEqual([
      { id: "sede-1", nombre: "Sede principal" },
      { id: "sede-2", nombre: "Sede norte" },
    ]);
    expect(mockUsuarioSedeFindMany).not.toHaveBeenCalled();
  });

  it("lists only a TECNICO's assigned sedes", async () => {
    mockUsuarioSedeFindMany.mockResolvedValue([
      { sede: { id: "sede-1", nombre: "Sede principal" } },
      { sede: { id: "sede-2", nombre: "Sede norte" } },
    ]);

    const result = await listSedesDisponibles(tenantDbListado, "u1", "TECNICO");

    expect(result).toEqual([
      { id: "sede-1", nombre: "Sede principal" },
      { id: "sede-2", nombre: "Sede norte" },
    ]);
    expect(mockUsuarioSedeFindMany).toHaveBeenCalledWith({
      where: { usuarioId: "u1" },
      select: { sede: { select: { id: true, nombre: true } } },
    });
    expect(mockSedeFindMany).not.toHaveBeenCalled();
  });

  it("returns an empty list for a RECEPCION with no assignments", async () => {
    mockUsuarioSedeFindMany.mockResolvedValue([]);

    const result = await listSedesDisponibles(tenantDbListado, "u1", "RECEPCION");

    expect(result).toEqual([]);
  });
});
