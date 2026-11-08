import { describe, expect, it } from "vitest";
import {
  crearTarifaIvaSchema,
  etiquetaTarifa,
  motivoNoDesactivar,
  motivoNoPredeterminar,
  textoPorcentaje,
} from "./tarifas";

describe("textos de tarifas", () => {
  it("formatea el porcentaje en español", () => {
    expect(textoPorcentaje(19)).toBe("19 %");
    expect(textoPorcentaje(0)).toBe("0 %");
    expect(textoPorcentaje(2.5)).toBe("2,5 %");
    expect(etiquetaTarifa({ porcentaje: 5, nombre: "Reducida" })).toBe("5 % · Reducida");
  });
});

describe("crearTarifaIvaSchema", () => {
  it("acepta coma o punto decimal y limpia el nombre", () => {
    expect(crearTarifaIvaSchema.parse({ porcentaje: "19", nombre: " General " })).toEqual({ porcentaje: 19, nombre: "General" });
    expect(crearTarifaIvaSchema.parse({ porcentaje: "2,5", nombre: "Especial" }).porcentaje).toBe(2.5);
    expect(crearTarifaIvaSchema.parse({ porcentaje: "0", nombre: "Exento" }).porcentaje).toBe(0);
  });

  it("rechaza valores fuera de rango, con más de 2 decimales o vacíos", () => {
    expect(crearTarifaIvaSchema.safeParse({ porcentaje: "101", nombre: "x" }).success).toBe(false);
    expect(crearTarifaIvaSchema.safeParse({ porcentaje: "-5", nombre: "x" }).success).toBe(false);
    expect(crearTarifaIvaSchema.safeParse({ porcentaje: "5,555", nombre: "x" }).success).toBe(false);
    expect(crearTarifaIvaSchema.safeParse({ porcentaje: "", nombre: "x" }).success).toBe(false);
    expect(crearTarifaIvaSchema.safeParse({ porcentaje: "5", nombre: "  " }).success).toBe(false);
  });
});

describe("reglas de la predeterminada", () => {
  it("no se desactiva la predeterminada ni se predetermina una inactiva", () => {
    expect(motivoNoDesactivar({ predeterminada: true })).not.toBeNull();
    expect(motivoNoDesactivar({ predeterminada: false })).toBeNull();
    expect(motivoNoPredeterminar({ activa: false })).not.toBeNull();
    expect(motivoNoPredeterminar({ activa: true })).toBeNull();
  });
});
