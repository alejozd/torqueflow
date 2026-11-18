import { describe, expect, it } from "vitest";
import { computeCotizacionTotales, etiquetaDescuento, ivaSumadoAparte, porcentajeVisible } from "./totales";

const items = [
  { tipo: "REPUESTO" as const, cantidad: 2, precioUnitario: 50_000 },
  { tipo: "MANO_OBRA" as const, cantidad: 1, precioUnitario: 100_000 },
];

describe("computeCotizacionTotales", () => {
  it("separa repuestos y mano de obra; el total es lo cotizado menos el descuento (IVA incluido)", () => {
    const totales = computeCotizacionTotales({ items, descuentoPct: 10 });
    expect(totales).toEqual({
      subtotalRepuestos: 100_000,
      subtotalManoObra: 100_000,
      subtotal: 200_000,
      descuento: 20_000,
      // 180.000 / 1,19 = 151.260,50 de base; el resto es el IVA que va dentro.
      iva: 28_739.5,
      desgloseIva: [{ ivaPct: 19, base: 151_260.5, iva: 28_739.5 }],
      total: 180_000,
    });
  });

  it("con varias tarifas reparte el descuento y separa el IVA que va dentro de cada una", () => {
    const totales = computeCotizacionTotales({
      items: [
        { tipo: "REPUESTO", cantidad: 1, precioUnitario: 119_000, ivaPct: 19 },
        { tipo: "REPUESTO", cantidad: 1, precioUnitario: 105_000, ivaPct: 5 },
        { tipo: "MANO_OBRA", cantidad: 1, precioUnitario: 50_000, ivaPct: 0 },
      ],
      descuentoPct: 10,
    });
    expect(totales.desgloseIva).toEqual([
      { ivaPct: 19, base: 90_000, iva: 17_100 },
      { ivaPct: 5, base: 90_000, iva: 4_500 },
      { ivaPct: 0, base: 45_000, iva: 0 },
    ]);
    expect(totales.iva).toBe(21_600);
    expect(totales.total).toBe(274_000 - 27_400);
  });

  it("sin tipo de descuento se comporta como porcentaje", () => {
    const sinTipo = computeCotizacionTotales({ items, descuentoPct: 5 });
    const conTipo = computeCotizacionTotales({ items, descuentoPct: 5, descuentoTipo: "PORCENTAJE", descuentoMonto: 99_999 });
    expect(conTipo).toEqual(sinTipo);
  });

  it("con monto fijo descuenta los pesos indicados e ignora el porcentaje", () => {
    const totales = computeCotizacionTotales({ items, descuentoPct: 50, descuentoTipo: "MONTO", descuentoMonto: 30_000 });
    expect(totales.descuento).toBe(30_000);
    expect(totales.iva).toBe(27_142.86);
    expect(totales.total).toBe(170_000);
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

describe("descuento en pesos enteros", () => {
  it("un porcentaje que no da exacto se redondea al peso", () => {
    const totales = computeCotizacionTotales({
      items: [{ tipo: "REPUESTO", cantidad: 1, precioUnitario: 333_381 }],
      descuentoPct: 10,
    });
    expect(totales.descuento).toBe(33_338);
    expect(totales.total).toBe(300_043);
  });
});

describe("ivaSumadoAparte", () => {
  it("en una cotización de antes del IVA incluido es lo que el total pasa del subtotal menos el descuento", () => {
    expect(ivaSumadoAparte({ subtotal: 511_881, descuento: 0, total: 581_503 })).toBe(69_622);
  });

  it("en las de ahora es 0, aunque haya centavos de diferencia", () => {
    expect(ivaSumadoAparte({ subtotal: 333_381, descuento: 33_338, total: 300_043 })).toBe(0);
    expect(ivaSumadoAparte({ subtotal: 333_381, descuento: 33_338.1, total: 300_042.9 })).toBe(0);
  });
});

describe("etiquetaDescuento y porcentajeVisible", () => {
  it("el porcentaje se muestra solo cuando el descuento es por porcentaje", () => {
    expect(etiquetaDescuento(porcentajeVisible("PORCENTAJE", 10))).toBe("Descuento (10%)");
    expect(etiquetaDescuento(porcentajeVisible("MONTO", 10))).toBe("Descuento");
  });
});
