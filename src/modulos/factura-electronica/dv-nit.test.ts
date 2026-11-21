// @vitest-environment node
import { describe, expect, it } from "vitest";
import { calcularDvNit } from "./dv-nit";

describe("calcularDvNit", () => {
  it("calcula el DV con el algoritmo de la DIAN", () => {
    expect(calcularDvNit("800197268")).toBe("4"); // NIT de la DIAN
    expect(calcularDvNit("901249232")).toBe("0"); // Nextpyme Colombia SAS
    expect(calcularDvNit("900123456")).toBe("8");
  });
  it("ignora puntos, espacios y guiones", () => {
    expect(calcularDvNit("800.197.268")).toBe("4");
  });
  it("falla si no hay dígitos", () => {
    expect(() => calcularDvNit("abc")).toThrow(/NIT/);
  });
});
