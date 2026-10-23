import { describe, expect, it } from "vitest";
import { montoExacto } from "./monto-exacto";

describe("montoExacto", () => {
  it("852594.93 queda como decimal exacto", () => {
    expect(montoExacto(852594.93).toFixed(2)).toBe("852594.93");
    expect(montoExacto(852594.93).toString()).toBe("852594.93");
  });
  it("0.1 + 0.2 queda como 0.3", () => {
    expect(montoExacto(0.1 + 0.2).toString()).toBe("0.3");
  });
  it("enteros", () => {
    expect(montoExacto(170000).toString()).toBe("170000");
    expect(montoExacto(0).toString()).toBe("0");
  });
});
