import { describe, expect, it } from "vitest";
import { marcaVehiculoInputSchema, modeloVehiculoInputSchema } from "./vehiculo-marca-modelo";

describe("marcaVehiculoInputSchema", () => {
  it("rejects a blank nombre and trims it", () => {
    expect(marcaVehiculoInputSchema.safeParse({ nombre: "   " }).success).toBe(false);
    expect(marcaVehiculoInputSchema.parse({ nombre: "  Mazda " }).nombre).toBe("Mazda");
  });
});

describe("modeloVehiculoInputSchema", () => {
  it("rejects a blank nombre and trims it", () => {
    expect(modeloVehiculoInputSchema.safeParse({ marcaId: "m1", nombre: "   " }).success).toBe(false);
    expect(modeloVehiculoInputSchema.parse({ marcaId: "m1", nombre: " Mazda 3 " }).nombre).toBe("Mazda 3");
  });
});
