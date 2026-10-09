import { describe, expect, it } from "vitest";
import { entradaMercanciaItemInputSchema, proveedorInputSchema, repuestoInputSchema } from "./inventario";

const repuestoBase = {
  codigo: "FLT-001",
  nombre: "Filtro de aceite",
  precioCompra: "18000",
  precioVenta: "25000",
  stockMinimo: "5",
  bodegaId: "b1",
};

describe("repuestoInputSchema (reposición)", () => {
  it("defaults multiploCompra to 1 and leaves stockMaximo unset when the fields are empty or missing", () => {
    const vacios = repuestoInputSchema.parse({ ...repuestoBase, stockMaximo: "", multiploCompra: "" });
    const ausentes = repuestoInputSchema.parse({ ...repuestoBase, stockMaximo: null, multiploCompra: null });

    for (const datos of [vacios, ausentes]) {
      expect(datos.stockMaximo).toBeUndefined();
      expect(datos.multiploCompra).toBe(1);
    }
  });

  it("accepts a stockMaximo above the minimum and coerces both numbers", () => {
    const datos = repuestoInputSchema.parse({ ...repuestoBase, stockMaximo: "12", multiploCompra: "6" });
    expect(datos).toMatchObject({ stockMaximo: 12, multiploCompra: 6 });
  });

  it("rejects a stockMaximo at or below the minimum on the stockMaximo field", () => {
    const resultado = repuestoInputSchema.safeParse({ ...repuestoBase, stockMaximo: "5" });
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]).toMatchObject({
      path: ["stockMaximo"],
      message: "El stock máximo debe ser mayor que el stock mínimo",
    });
  });

  it("rejects a multiploCompra below 1", () => {
    expect(repuestoInputSchema.safeParse({ ...repuestoBase, multiploCompra: "0" }).success).toBe(false);
  });
});

describe("proveedorInputSchema (diasEntrega)", () => {
  it("defaults diasEntrega to 3 when empty or missing", () => {
    expect(proveedorInputSchema.parse({ nombre: "Bosch", diasEntrega: "" }).diasEntrega).toBe(3);
    expect(proveedorInputSchema.parse({ nombre: "Bosch", diasEntrega: null }).diasEntrega).toBe(3);
  });

  it("accepts 0 to 90 days and rejects anything outside", () => {
    expect(proveedorInputSchema.parse({ nombre: "Bosch", diasEntrega: "0" }).diasEntrega).toBe(0);
    expect(proveedorInputSchema.safeParse({ nombre: "Bosch", diasEntrega: "91" }).success).toBe(false);
    expect(proveedorInputSchema.safeParse({ nombre: "Bosch", diasEntrega: "-1" }).success).toBe(false);
  });
});

describe("entradaMercanciaItemInputSchema (cantidad)", () => {
  const item = { repuestoId: "r1", precioCompraUnitario: "1000" };

  it("accepts up to 100.000 units and rejects anything above with a clear message", () => {
    expect(entradaMercanciaItemInputSchema.safeParse({ ...item, cantidad: "100000" }).success).toBe(true);
    const resultado = entradaMercanciaItemInputSchema.safeParse({ ...item, cantidad: "10000000000" });
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0].message).toBe("La cantidad no puede superar 100.000 unidades");
  });
});
