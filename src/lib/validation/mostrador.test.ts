import { describe, expect, it } from "vitest";
import { devolucionMostradorInputSchema, lineaVentaSchema, ventaMostradorInputSchema } from "./mostrador";
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
      metodoPago: "EFECTIVO",
      cobrarTodo: "true",
    });

    expect(venta.clienteId).toBeUndefined();
    expect(venta.descuento).toBe(0);
    expect(venta.cobrarTodo).toBe(true);
    expect(venta.lineas).toHaveLength(1);
  });

  it("exige al menos una línea y rechaza métodos que no son de caja", () => {
    expect(ventaMostradorInputSchema.safeParse({ lineas: [], metodoPago: "EFECTIVO" }).success).toBe(false);
    // ANTICIPO es de la orden, no del mostrador.
    expect(
      ventaMostradorInputSchema.safeParse({ lineas: [linea], metodoPago: "ANTICIPO", cobrarTodo: "true" }).success,
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
