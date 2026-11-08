import { describe, expect, it } from "vitest";
import { interpretarCantidadEntera, interpretarPrecio } from "./celda-editable";

describe("interpretarPrecio", () => {
  it("lee el formato colombiano: punto de miles y coma decimal", () => {
    expect(interpretarPrecio("38.000")).toBe("38000");
    expect(interpretarPrecio("$ 38.000")).toBe("38000");
    expect(interpretarPrecio("1.250.000")).toBe("1250000");
    expect(interpretarPrecio("38000,5")).toBe("38000.5");
    expect(interpretarPrecio("198.686,62")).toBe("198686.62");
  });

  it("no multiplica por 100 el valor crudo con centavos que muestra la celda al entrar", () => {
    // La celda muestra String(198686.62) al tomar el foco; salir sin tocar no debe cambiarlo.
    expect(interpretarPrecio("198686.62")).toBe("198686.62");
    expect(interpretarPrecio("69860.8")).toBe("69860.8");
  });

  it("rechaza vacío", () => {
    expect(interpretarPrecio("")).toBeNull();
    expect(interpretarPrecio("abc")).toBeNull();
  });
});

describe("interpretarCantidadEntera", () => {
  it("acepta enteros de 1 a 9999 y rechaza decimales, cero y texto", () => {
    expect(interpretarCantidadEntera("3")).toBe("3");
    expect(interpretarCantidadEntera(" 12 ")).toBe("12");
    expect(interpretarCantidadEntera("1,5")).toBeNull();
    expect(interpretarCantidadEntera("0")).toBeNull();
    expect(interpretarCantidadEntera("abc")).toBeNull();
    expect(interpretarCantidadEntera("10000")).toBeNull();
  });
});
