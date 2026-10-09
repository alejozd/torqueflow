import { describe, expect, it, vi } from "vitest";
import { comprometidoPorRepuesto, estaBajoMinimo, whereItemsComprometidos } from "./comprometido";

describe("whereItemsComprometidos", () => {
  it("targets repuesto items of the sede on non-anulada ordenes without a factura", () => {
    expect(whereItemsComprometidos("sede-1")).toEqual({
      repuestoId: { not: null },
      repuesto: { bodega: { sedeId: "sede-1" } },
      orden: { estado: { not: "ANULADA" }, factura: null },
    });
  });
});

describe("comprometidoPorRepuesto", () => {
  it("sums cantidad per repuesto with one groupBy", async () => {
    const groupBy = vi.fn().mockResolvedValue([
      { repuestoId: "a", _sum: { cantidad: 3 } },
      { repuestoId: "b", _sum: { cantidad: null } },
      { repuestoId: null, _sum: { cantidad: 9 } },
    ]);
    const tenantDb = { itemOrden: { groupBy } } as never;

    const mapa = await comprometidoPorRepuesto(tenantDb, "sede-1");

    expect(groupBy).toHaveBeenCalledWith({
      by: ["repuestoId"],
      where: whereItemsComprometidos("sede-1"),
      _sum: { cantidad: true },
    });
    expect([...mapa.entries()]).toEqual([
      ["a", 3],
      ["b", 0],
    ]);
  });
});

describe("estaBajoMinimo", () => {
  it("compares what is left after open ordenes against the minimum", () => {
    expect(estaBajoMinimo({ stockActual: 8, stockMinimo: 5 }, 0)).toBe(false);
    expect(estaBajoMinimo({ stockActual: 8, stockMinimo: 5 }, 3)).toBe(true);
    expect(estaBajoMinimo({ stockActual: 5, stockMinimo: 5 }, 0)).toBe(true);
  });
});
