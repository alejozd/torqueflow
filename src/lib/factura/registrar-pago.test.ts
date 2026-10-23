import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma-tenant";
import { registrarPagoEnTransaccion } from "./registrar-pago";

describe("registrarPagoEnTransaccion", () => {
  it("compara el saldo con el monto como decimal exacto, no como número", async () => {
    const tx = {
      factura: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ saldoPendiente: "0" }),
        update: vi.fn(),
      },
      pago: { create: vi.fn() },
    };
    await registrarPagoEnTransaccion(tx as unknown as Prisma.TransactionClient, {
      facturaId: "f1", monto: 852594.93, metodoPago: "EFECTIVO", referencia: null, registradoPorId: "u1",
    });
    const arg = tx.factura.updateMany.mock.calls[0]![0];
    expect(String(arg.where.saldoPendiente.gte)).toBe("852594.93");
    expect(typeof arg.where.saldoPendiente.gte).toBe("object");
    expect(String(arg.data.saldoPendiente.decrement)).toBe("852594.93");
  });
});
