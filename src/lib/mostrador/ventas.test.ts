import { describe, expect, it } from "vitest";
import { cantidadDevolvible, calcularTotalesVenta, montoADevolverPermitido, totalDevolucion } from "./ventas";

describe("calcularTotalesVenta", () => {
  it("usa las mismas reglas que la factura: IVA sobre la base y descuento como monto", () => {
    const r = calcularTotalesVenta([{ cantidad: 2, precioUnitario: 50000 }], 10000);

    expect(r.subtotal).toBe(100000);
    expect(r.descuento).toBe(10000);
    expect(r.iva).toBe(17100); // (100000 - 10000) * 0.19
    expect(r.total).toBe(107100);
  });

  it("sin descuento y sin líneas da cero", () => {
    expect(calcularTotalesVenta([], 0)).toEqual({ subtotal: 0, descuento: 0, iva: 0, total: 0 });
  });

  it("un descuento negativo se trata como cero", () => {
    expect(calcularTotalesVenta([{ cantidad: 1, precioUnitario: 1000 }], -500).descuento).toBe(0);
  });
});

describe("cantidadDevolvible", () => {
  it("nunca es negativa ni supera lo vendido", () => {
    expect(cantidadDevolvible(3, 0)).toBe(3);
    expect(cantidadDevolvible(3, 2)).toBe(1);
    expect(cantidadDevolvible(3, 3)).toBe(0);
    expect(cantidadDevolvible(3, 5)).toBe(0);
    expect(cantidadDevolvible(3, -1)).toBe(3);
  });
});

describe("totalDevolucion y su tope", () => {
  it("devuelve el valor de las líneas con su IVA", () => {
    // Venta sin descuento: factor 1.
    expect(totalDevolucion([{ cantidad: 1, precioUnitario: 100000 }], { subtotal: 100000, total: 119000 })).toBe(119000);
  });

  it("reparte el descuento de la venta en proporción a lo devuelto", () => {
    // Dos líneas de 100.000 con 50.000 de descuento: la venta cobró 178.500.
    const venta = { subtotal: 200000, total: 178500 };

    // Devolver una línea no paga 119.000 (su precio sin descuento) sino su parte.
    expect(totalDevolucion([{ cantidad: 1, precioUnitario: 100000 }], venta)).toBe(89250);
    // Devolver todo devuelve exactamente lo cobrado.
    expect(totalDevolucion([{ cantidad: 2, precioUnitario: 100000 }], venta)).toBe(178500);
  });

  it("sin subtotal (venta de solo líneas libres a cero) no devuelve nada", () => {
    expect(totalDevolucion([{ cantidad: 1, precioUnitario: 0 }], { subtotal: 0, total: 0 })).toBe(0);
  });

  it("el tope impide devolver más de lo que se cobró", () => {
    const totalVenta = calcularTotalesVenta([{ cantidad: 2, precioUnitario: 50000 }], 10000).total;
    const calculado = totalDevolucion([{ cantidad: 2, precioUnitario: 50000 }], { subtotal: 100000, total: totalVenta });

    expect(calculado).toBe(totalVenta);
    expect(montoADevolverPermitido(totalVenta, 0, calculado)).toBe(totalVenta);
  });

  it("el tope también descuenta lo ya devuelto y nunca baja de cero", () => {
    expect(montoADevolverPermitido(100000, 40000, 50000)).toBe(50000);
    expect(montoADevolverPermitido(100000, 90000, 50000)).toBe(10000);
    expect(montoADevolverPermitido(100000, 120000, 50000)).toBe(0);
  });
});
