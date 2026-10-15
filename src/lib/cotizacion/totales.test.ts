import { describe, expect, it } from "vitest";
import { computeCotizacionTotales } from "./totales";

const items = [
  { tipo: "REPUESTO" as const, cantidad: 2, precioUnitario: 50_000 },
  { tipo: "MANO_OBRA" as const, cantidad: 1, precioUnitario: 100_000 },
];

describe("computeCotizacionTotales", () => {
  it("separa repuestos y mano de obra y aplica IVA sobre la base con descuento", () => {
    const totales = computeCotizacionTotales({ items, descuentoPct: 10 });
    expect(totales).toEqual({
      subtotalRepuestos: 100_000,
      subtotalManoObra: 100_000,
      subtotal: 200_000,
      descuento: 20_000,
      iva: 34_200,
      total: 214_200,
    });
  });

  it("sin tipo de descuento se comporta como porcentaje", () => {
    const sinTipo = computeCotizacionTotales({ items, descuentoPct: 5 });
    const conTipo = computeCotizacionTotales({ items, descuentoPct: 5, descuentoTipo: "PORCENTAJE", descuentoMonto: 99_999 });
    expect(conTipo).toEqual(sinTipo);
  });

  it("con monto fijo descuenta los pesos indicados e ignora el porcentaje", () => {
    const totales = computeCotizacionTotales({ items, descuentoPct: 50, descuentoTipo: "MONTO", descuentoMonto: 30_000 });
    expect(totales.descuento).toBe(30_000);
    expect(totales.iva).toBe(32_300);
    expect(totales.total).toBe(202_300);
  });

  it("limita el monto fijo al subtotal y nunca lo deja negativo", () => {
    expect(computeCotizacionTotales({ items, descuentoPct: 0, descuentoTipo: "MONTO", descuentoMonto: 500_000 })).toMatchObject({
      descuento: 200_000,
      iva: 0,
      total: 0,
    });
    expect(computeCotizacionTotales({ items, descuentoPct: 0, descuentoTipo: "MONTO", descuentoMonto: -10 }).descuento).toBe(0);
  });

  it("sin ítems todo queda en cero", () => {
    expect(computeCotizacionTotales({ items: [], descuentoPct: 0, descuentoTipo: "MONTO", descuentoMonto: 10_000 }).total).toBe(0);
  });
});
