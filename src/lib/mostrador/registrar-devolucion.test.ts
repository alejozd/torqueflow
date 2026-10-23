import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma-tenant";

vi.mock("@/lib/auditoria/registrarEvento", () => ({ registrarEventoAuditoria: vi.fn() }));

import { registrarDevolucionEnTransaccion } from "./registrar-devolucion";

describe("registrarDevolucionEnTransaccion", () => {
  it("compara el saldo con lo devuelto a cuenta como decimal exacto, no como número", async () => {
    const tx = {
      ventaMostradorItem: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      ventaMostrador: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ saldoPendiente: "10" }),
        update: vi.fn(),
      },
      repuesto: { update: vi.fn() },
      devolucionMostrador: { create: vi.fn().mockResolvedValue({ id: "d1", numero: 1 }) },
    };
    await registrarDevolucionEnTransaccion(tx as unknown as Prisma.TransactionClient, {
      ventaId: "v1", sedeId: "s1", motivo: null, metodoPago: "EFECTIVO",
      total: 852594.93, aCuenta: 852594.93, enEfectivo: 0, creadoPorId: "u1",
      lineas: new Map([["i1", { cantidad: 1, vendida: 1, repuestoId: null, precioUnitario: 852594.93 }]]),
    });
    const arg = tx.ventaMostrador.updateMany.mock.calls[0]![0];
    expect(String(arg.where.saldoPendiente.gte)).toBe("852594.93");
    expect(typeof arg.where.saldoPendiente.gte).toBe("object");
    expect(String(arg.data.saldoPendiente.decrement)).toBe("852594.93");
  });
});
