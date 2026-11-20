import { describe, expect, it } from "vitest";
import { ivaDelDocumento } from "./documento";

describe("ivaDelDocumento", () => {
  it("discrimina la base y el IVA de cada tarifa, con el descuento repartido", () => {
    const resultado = ivaDelDocumento({
      subtotal: 200881,
      descuento: 20088,
      total: 180793,
      lineas: [{ importe: 200881, ivaPct: 19 }],
    });
    expect(resultado.ivaAparte).toBe(0);
    expect(resultado.filas).toEqual([
      { etiqueta: "Base gravable 19 %", valor: 151927 },
      { etiqueta: "IVA 19 %", valor: 28866 },
    ]);
  });

  it("lo exento sale en una sola fila", () => {
    const { filas } = ivaDelDocumento({
      subtotal: 219000,
      descuento: 0,
      total: 219000,
      lineas: [
        { importe: 119000, ivaPct: 19 },
        { importe: 100000, ivaPct: 0 },
      ],
    });
    expect(filas).toEqual([
      { etiqueta: "Base gravable 19 %", valor: 100000 },
      { etiqueta: "IVA 19 %", valor: 19000 },
      { etiqueta: "Exento de IVA", valor: 100000 },
    ]);
  });

  it("usa los tramos guardados de la factura cuando los hay", () => {
    const { filas } = ivaDelDocumento({
      subtotal: 119000,
      descuento: 0,
      total: 119000,
      lineas: [{ importe: 119000, ivaPct: 5 }],
      tramosGuardados: [{ ivaPct: 19, base: 100000, iva: 19000 }],
    });
    expect(filas[1]).toEqual({ etiqueta: "IVA 19 %", valor: 19000 });
  });

  it("en un documento de antes del IVA incluido devuelve el IVA sumado aparte", () => {
    expect(ivaDelDocumento({ subtotal: 100000, descuento: 0, total: 119000, lineas: [{ importe: 100000 }] })).toEqual({
      ivaAparte: 19000,
      filas: [],
    });
  });
});
