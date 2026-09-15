import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma-tenant";
import { registrarEventoAuditoria } from "./registrarEvento";

function buildTx(create = vi.fn()): Prisma.TransactionClient {
  return { auditLog: { create } } as unknown as Prisma.TransactionClient;
}

describe("registrarEventoAuditoria", () => {
  it("creates an AuditLog row with every field, including detalle", async () => {
    const create = vi.fn();
    const tx = buildTx(create);

    await registrarEventoAuditoria(tx, {
      tipo: "ORDEN_ANULAR",
      actorId: "u1",
      entidadTipo: "OrdenTrabajo",
      entidadId: "o1",
      detalle: { estadoAnterior: "EN_PROCESO" },
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        tipo: "ORDEN_ANULAR",
        actorId: "u1",
        entidadTipo: "OrdenTrabajo",
        entidadId: "o1",
        detalle: { estadoAnterior: "EN_PROCESO" },
      },
    });
  });

  it("creates a row with actorId null and no detalle", async () => {
    const create = vi.fn();
    const tx = buildTx(create);

    await registrarEventoAuditoria(tx, {
      tipo: "BODEGA_ELIMINAR",
      actorId: null,
      entidadTipo: "Bodega",
      entidadId: "b1",
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        tipo: "BODEGA_ELIMINAR",
        actorId: null,
        entidadTipo: "Bodega",
        entidadId: "b1",
        detalle: undefined,
      },
    });
  });
});
