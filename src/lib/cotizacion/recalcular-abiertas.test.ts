import { describe, expect, it, vi } from "vitest";

const mockRecompute = vi.fn();
vi.mock("./recompute-totales", () => ({
  recomputeCotizacionTotales: (...args: unknown[]) => mockRecompute(...args),
}));

import { recalcularCotizacionesAbiertas } from "./recalcular-abiertas";

describe("recalcularCotizacionesAbiertas", () => {
  it("recalcula solo las cotizaciones en borrador o enviadas, cada una en su transacción", async () => {
    const tx = { marca: "tx" };
    const db = {
      cotizacion: { findMany: vi.fn().mockResolvedValue([{ id: "c1" }, { id: "c2" }]) },
      $transaction: vi.fn((fn: (cliente: unknown) => unknown) => fn(tx)),
    };

    const recalculadas = await recalcularCotizacionesAbiertas(db as never);

    expect(recalculadas).toBe(2);
    expect(db.cotizacion.findMany).toHaveBeenCalledWith({
      where: { estado: { in: ["BORRADOR", "ENVIADA"] } },
      select: { id: true },
    });
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(mockRecompute).toHaveBeenCalledWith(tx, "c1");
    expect(mockRecompute).toHaveBeenCalledWith(tx, "c2");
  });
});
