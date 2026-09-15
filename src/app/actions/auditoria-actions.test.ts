import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockAuditLogFindMany = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    auditLog: { findMany: mockAuditLogFindMany },
  }),
}));

import { listAuditLog } from "./auditoria-actions";

const SESSION_ADMIN = { user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };

beforeEach(() => {
  mockRequireRole.mockReset().mockResolvedValue(SESSION_ADMIN);
  mockAuditLogFindMany.mockReset();
});

describe("listAuditLog", () => {
  it("requires an ADMIN session and returns events with the actor's nombre resolved", async () => {
    mockAuditLogFindMany.mockResolvedValue([
      {
        id: "al1",
        tipo: "ORDEN_ANULAR",
        actor: { nombre: "Ana Pérez" },
        entidadTipo: "OrdenTrabajo",
        entidadId: "o1",
        detalle: { estadoAnterior: "EN_PROCESO" },
        createdAt: new Date("2026-09-01T10:00:00Z"),
      },
    ]);

    const eventos = await listAuditLog();

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
    expect(eventos).toEqual([
      {
        id: "al1",
        tipo: "ORDEN_ANULAR",
        actorNombre: "Ana Pérez",
        entidadTipo: "OrdenTrabajo",
        entidadId: "o1",
        detalle: { estadoAnterior: "EN_PROCESO" },
        createdAt: new Date("2026-09-01T10:00:00Z"),
      },
    ]);
  });

  it("resolves actorNombre to null when the actor was deleted", async () => {
    mockAuditLogFindMany.mockResolvedValue([
      {
        id: "al2",
        tipo: "USUARIO_ELIMINAR",
        actor: null,
        entidadTipo: "Usuario",
        entidadId: "u9",
        detalle: null,
        createdAt: new Date("2026-09-02T10:00:00Z"),
      },
    ]);

    const eventos = await listAuditLog();

    expect(eventos[0].actorNombre).toBeNull();
  });

  it("filters by tipo when provided", async () => {
    mockAuditLogFindMany.mockResolvedValue([]);

    await listAuditLog({ tipo: "BODEGA_ELIMINAR" });

    expect(mockAuditLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tipo: "BODEGA_ELIMINAR" } }),
    );
  });
});
