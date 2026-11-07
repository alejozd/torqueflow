import { describe, expect, it } from "vitest";
import { infoCumpleanos, textoCumpleanos } from "./cumpleanos";

describe("infoCumpleanos", () => {
  it("calcula edad y días que faltan para el próximo cumpleaños", () => {
    expect(infoCumpleanos("1980-03-12", "2026-11-07")).toEqual({ edad: 46, diasParaCumple: 125, cumpleHoy: false });
    expect(infoCumpleanos("1990-11-30", "2026-11-07")).toEqual({ edad: 35, diasParaCumple: 23, cumpleHoy: false });
  });

  it("detecta el cumpleaños de hoy y no le resta un año a la edad", () => {
    expect(infoCumpleanos("1985-11-07", "2026-11-07")).toEqual({ edad: 41, diasParaCumple: 0, cumpleHoy: true });
  });

  it("si ya pasó este año, cuenta hasta el del año siguiente", () => {
    expect(infoCumpleanos("2000-11-06", "2026-11-07")).toEqual({ edad: 26, diasParaCumple: 364, cumpleHoy: false });
  });

  it("el 29 de febrero se celebra el 28 en años no bisiestos", () => {
    expect(infoCumpleanos("2000-02-29", "2027-02-27")).toEqual({ edad: 26, diasParaCumple: 1, cumpleHoy: false });
    expect(infoCumpleanos("2000-02-29", "2027-02-28")).toEqual({ edad: 27, diasParaCumple: 0, cumpleHoy: true });
    expect(infoCumpleanos("2000-02-29", "2028-02-29")).toEqual({ edad: 28, diasParaCumple: 0, cumpleHoy: true });
  });
});

describe("textoCumpleanos", () => {
  it("arma la frase corta", () => {
    expect(textoCumpleanos({ edad: 46, diasParaCumple: 125, cumpleHoy: false })).toBe("46 años · cumple en 125 días");
    expect(textoCumpleanos({ edad: 35, diasParaCumple: 1, cumpleHoy: false })).toBe("35 años · cumple mañana");
    expect(textoCumpleanos({ edad: 41, diasParaCumple: 0, cumpleHoy: true })).toBe("¡Cumple 41 años hoy!");
    expect(textoCumpleanos({ edad: 1, diasParaCumple: 30, cumpleHoy: false })).toBe("1 año · cumple en 30 días");
  });
});
