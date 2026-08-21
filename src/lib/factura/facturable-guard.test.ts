import { describe, expect, it } from "vitest";
import { assertOrdenFacturable } from "./facturable-guard";

describe("assertOrdenFacturable", () => {
  it("does not throw for TERMINADA", () => {
    expect(() => assertOrdenFacturable({ estado: "TERMINADA" })).not.toThrow();
  });

  it("does not throw for ENTREGADA", () => {
    expect(() => assertOrdenFacturable({ estado: "ENTREGADA" })).not.toThrow();
  });

  it("throws for BORRADOR", () => {
    expect(() => assertOrdenFacturable({ estado: "BORRADOR" })).toThrow(
      "No se puede facturar una orden en estado BORRADOR. Debe estar Terminada o Entregada.",
    );
  });

  it("throws for EN_PROCESO", () => {
    expect(() => assertOrdenFacturable({ estado: "EN_PROCESO" })).toThrow(/Debe estar Terminada o Entregada/);
  });

  it("throws for ANULADA", () => {
    expect(() => assertOrdenFacturable({ estado: "ANULADA" })).toThrow(/Debe estar Terminada o Entregada/);
  });
});
