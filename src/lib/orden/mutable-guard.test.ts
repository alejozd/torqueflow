import { describe, expect, it } from "vitest";
import { assertOrdenMutable } from "./mutable-guard";

describe("assertOrdenMutable", () => {
  it("throws for estado ENTREGADA", () => {
    expect(() => assertOrdenMutable({ estado: "ENTREGADA", factura: null })).toThrow(
      "No se puede modificar una orden en estado ENTREGADA.",
    );
  });

  it("throws for estado ANULADA", () => {
    expect(() => assertOrdenMutable({ estado: "ANULADA", factura: null })).toThrow(
      "No se puede modificar una orden en estado ANULADA.",
    );
  });

  it("does not throw for BORRADOR", () => {
    expect(() => assertOrdenMutable({ estado: "BORRADOR", factura: null })).not.toThrow();
  });

  it("does not throw for EN_PROCESO", () => {
    expect(() => assertOrdenMutable({ estado: "EN_PROCESO", factura: null })).not.toThrow();
  });

  it("does not throw for TERMINADA", () => {
    expect(() => assertOrdenMutable({ estado: "TERMINADA", factura: null })).not.toThrow();
  });

  it("throws when the orden already has a factura, even in an otherwise-mutable estado", () => {
    expect(() => assertOrdenMutable({ estado: "TERMINADA", factura: { id: "f1" } })).toThrow(
      "No se puede modificar una orden que ya tiene una factura generada.",
    );
  });
});
