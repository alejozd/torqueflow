import { describe, expect, it } from "vitest";
import { estadoDisponibilidad } from "./disponibilidad";

describe("estadoDisponibilidad", () => {
  it("alcanza cuando la bodega cubre la cantidad, incluso justa", () => {
    expect(estadoDisponibilidad(5, 1)).toBe("alcanza");
    expect(estadoDisponibilidad(4, 4)).toBe("alcanza");
  });

  it("es parcial cuando hay algo pero no todo", () => {
    expect(estadoDisponibilidad(2, 4)).toBe("parcial");
  });

  it("está agotado sin existencias, aunque el stock venga negativo", () => {
    expect(estadoDisponibilidad(0, 1)).toBe("agotado");
    expect(estadoDisponibilidad(-3, 1)).toBe("agotado");
  });
});
