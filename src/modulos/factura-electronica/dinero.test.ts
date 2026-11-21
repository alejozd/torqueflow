// @vitest-environment node
import { describe, expect, it } from "vitest";
import { aTextoDecimal } from "./dinero";

describe("aTextoDecimal", () => {
  it("convierte centavos a texto con dos decimales", () => {
    expect(aTextoDecimal(0)).toBe("0.00");
    expect(aTextoDecimal(5)).toBe("0.05");
    expect(aTextoDecimal(119000000)).toBe("1190000.00");
    expect(aTextoDecimal(142853)).toBe("1428.53");
  });
  it("rechaza montos que no son enteros", () => {
    expect(() => aTextoDecimal(10.5)).toThrow(/centavos enteros/);
  });
});
