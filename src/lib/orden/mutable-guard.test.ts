import { describe, expect, it } from "vitest";
import { assertOrdenMutable } from "./mutable-guard";

describe("assertOrdenMutable", () => {
  it("throws for estado ENTREGADA", () => {
    expect(() => assertOrdenMutable({ estado: "ENTREGADA" })).toThrow(
      "No se puede modificar una orden en estado ENTREGADA.",
    );
  });

  it("throws for estado ANULADA", () => {
    expect(() => assertOrdenMutable({ estado: "ANULADA" })).toThrow(
      "No se puede modificar una orden en estado ANULADA.",
    );
  });

  it("does not throw for BORRADOR", () => {
    expect(() => assertOrdenMutable({ estado: "BORRADOR" })).not.toThrow();
  });

  it("does not throw for EN_PROCESO", () => {
    expect(() => assertOrdenMutable({ estado: "EN_PROCESO" })).not.toThrow();
  });

  it("does not throw for TERMINADA", () => {
    expect(() => assertOrdenMutable({ estado: "TERMINADA" })).not.toThrow();
  });
});
