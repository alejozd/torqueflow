import { describe, expect, it } from "vitest";
import { cobroVentaSchema, devolucionMostradorInputSchema, lineaVentaSchema, ventaMostradorInputSchema } from "./mostrador";
import { abonoProveedorSchema } from "./compras";

const linea = { descripcion: "Filtro de aceite", cantidad: "2", precioUnitario: "25000" };

describe("lineaVentaSchema", () => {
  it("acepta una línea con repuesto o libre, y convierte cantidad y precio", () => {
    const conRepuesto = lineaVentaSchema.parse({ ...linea, repuestoId: "r1" });
    expect(conRepuesto).toMatchObject({ repuestoId: "r1", cantidad: 2, precioUnitario: 25000 });

    const libre = lineaVentaSchema.parse({ ...linea, repuestoId: "" });
    expect(libre.repuestoId).toBeUndefined();
  });

  it("rechaza cantidad cero, negativa o decimal, y precio negativo", () => {
    expect(lineaVentaSchema.safeParse({ ...linea, cantidad: "0" }).success).toBe(false);
    expect(lineaVentaSchema.safeParse({ ...linea, cantidad: "-2" }).success).toBe(false);
    expect(lineaVentaSchema.safeParse({ ...linea, cantidad: "1.5" }).success).toBe(false);
    expect(lineaVentaSchema.safeParse({ ...linea, precioUnitario: "-1" }).success).toBe(false);
  });

  it("exige una descripción legible", () => {
    expect(lineaVentaSchema.safeParse({ ...linea, descripcion: "  " }).success).toBe(false);
  });
});

describe("ventaMostradorInputSchema", () => {
  it("acepta una venta con líneas y cobro", () => {
    const venta = ventaMostradorInputSchema.parse({
      clienteId: "",
      lineas: [linea],
      descuento: "",
      totalEsperado: "1000",
      pagos: [{ metodoPago: "EFECTIVO", monto: "1000" }],
    });

    expect(venta.clienteId).toBeUndefined();
    expect(venta.descuento).toBe(0);
    expect(venta.pagos).toEqual([{ metodoPago: "EFECTIVO", monto: 1000 }]);
    expect(venta.lineas).toHaveLength(1);
  });

  it("el monto de un abono tampoco admite más de 2 decimales", () => {
    expect(cobroVentaSchema.safeParse({ monto: "10.005", metodoPago: "EFECTIVO" }).success).toBe(false);
    expect(cobroVentaSchema.safeParse({ monto: "10.05", metodoPago: "EFECTIVO" }).success).toBe(true);
  });

  it("exige el total esperado con a lo sumo 2 decimales", () => {
    const base = { lineas: [linea], pagos: [] };
    expect(ventaMostradorInputSchema.safeParse(base).success).toBe(false);
    expect(ventaMostradorInputSchema.safeParse({ ...base, totalEsperado: "10.005" }).success).toBe(false);
    expect(ventaMostradorInputSchema.safeParse({ ...base, totalEsperado: "59500" }).success).toBe(true);
  });

  it("rechaza montos con más de 2 decimales", () => {
    const base = { lineas: [linea], totalEsperado: "0" };
    expect(ventaMostradorInputSchema.safeParse({ ...base, pagos: [{ metodoPago: "EFECTIVO", monto: "10.005" }] }).success).toBe(false);
    expect(ventaMostradorInputSchema.safeParse({ ...base, pagos: [], recibidoEfectivo: "10.005" }).success).toBe(false);
    expect(ventaMostradorInputSchema.safeParse({ ...base, pagos: [{ metodoPago: "EFECTIVO", monto: "10.05" }] }).success).toBe(true);
  });

  it("exige al menos una línea y rechaza métodos que no son de caja", () => {
    expect(ventaMostradorInputSchema.safeParse({ lineas: [], pagos: [] }).success).toBe(false);
    // ANTICIPO es de la orden, no del mostrador.
    expect(
      ventaMostradorInputSchema.safeParse({ lineas: [linea], pagos: [{ metodoPago: "ANTICIPO", monto: 1 }] }).success,
    ).toBe(false);
  });
});

describe("devolucionMostradorInputSchema", () => {
  it("exige venta, al menos una línea y una cantidad entera positiva", () => {
    const devolucion = devolucionMostradorInputSchema.parse({
      ventaId: "v1",
      lineas: [{ ventaItemId: "i1", cantidad: "1" }],
      motivo: "",
      metodoPago: "EFECTIVO",
    });

    expect(devolucion.motivo).toBeUndefined();
    expect(devolucionMostradorInputSchema.safeParse({ ventaId: "v1", lineas: [], metodoPago: "EFECTIVO" }).success).toBe(false);
    expect(
      devolucionMostradorInputSchema.safeParse({
        ventaId: "v1",
        lineas: [{ ventaItemId: "i1", cantidad: "0" }],
        metodoPago: "EFECTIVO",
      }).success,
    ).toBe(false);
  });
});

describe("abonoProveedorSchema", () => {
  it("exige un monto mayor que cero y un método", () => {
    const abono = abonoProveedorSchema.parse({ cuentaId: "c1", monto: "50000", metodoPago: "TRANSFERENCIA" });
    expect(abono.monto).toBe(50000);

    expect(abonoProveedorSchema.safeParse({ cuentaId: "c1", monto: "0", metodoPago: "EFECTIVO" }).success).toBe(false);
    expect(abonoProveedorSchema.safeParse({ cuentaId: "c1", monto: "-5", metodoPago: "EFECTIVO" }).success).toBe(false);
    expect(abonoProveedorSchema.safeParse({ cuentaId: "c1", monto: "100" }).success).toBe(false);
  });
});
