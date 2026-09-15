import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma-public";
import { registrarEventoAuditoriaPlataforma } from "./registrarEventoPlataforma";

function buildDb(create = vi.fn()): Prisma.TransactionClient {
  return { auditLogPlataforma: { create } } as unknown as Prisma.TransactionClient;
}

describe("registrarEventoAuditoriaPlataforma", () => {
  it("creates an AuditLogPlataforma row with every field", async () => {
    const create = vi.fn();
    const db = buildDb(create);

    await registrarEventoAuditoriaPlataforma(db, {
      tipo: "TENANT_CAMBIAR_ESTADO",
      superAdminId: "sa1",
      tenantId: "t1",
      detalle: { estadoNuevo: "SUSPENDIDO" },
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        tipo: "TENANT_CAMBIAR_ESTADO",
        superAdminId: "sa1",
        tenantId: "t1",
        detalle: { estadoNuevo: "SUSPENDIDO" },
      },
    });
  });

  it("creates a row with no detalle", async () => {
    const create = vi.fn();
    const db = buildDb(create);

    await registrarEventoAuditoriaPlataforma(db, {
      tipo: "TENANT_CREAR",
      superAdminId: "sa1",
      tenantId: "t1",
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        tipo: "TENANT_CREAR",
        superAdminId: "sa1",
        tenantId: "t1",
        detalle: undefined,
      },
    });
  });
});
