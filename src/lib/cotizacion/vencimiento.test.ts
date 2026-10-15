import { describe, expect, it } from "vitest";
import { avisoVencimiento } from "./vencimiento";

// 2026-09-09T15:00:00Z = 10:00am del 9 de septiembre en Bogotá.
const AHORA = new Date("2026-09-09T15:00:00Z");

describe("avisoVencimiento", () => {
  it("cuenta días calendario de Bogotá, no horas", () => {
    // 15 sep a las 23:00 de Bogotá = 16 sep 04:00Z: sigue siendo el 15 en Bogotá.
    expect(avisoVencimiento(new Date("2026-09-16T04:00:00Z"), AHORA)).toEqual({ texto: "Vence en 6 días", tono: "normal" });
  });

  it("avisa cuando quedan 3 días o menos", () => {
    expect(avisoVencimiento(new Date("2026-09-12T15:00:00Z"), AHORA)).toEqual({ texto: "Vence en 3 días", tono: "aviso" });
    expect(avisoVencimiento(new Date("2026-09-10T15:00:00Z"), AHORA)).toEqual({ texto: "Vence mañana", tono: "aviso" });
    expect(avisoVencimiento(new Date("2026-09-09T23:00:00Z"), AHORA)).toEqual({ texto: "Vence hoy", tono: "aviso" });
  });

  it("dice cuánto hace que venció", () => {
    expect(avisoVencimiento(new Date("2026-09-08T15:00:00Z"), AHORA)).toEqual({ texto: "Venció ayer", tono: "vencida" });
    expect(avisoVencimiento(new Date("2026-09-05T15:00:00Z"), AHORA)).toEqual({ texto: "Venció hace 4 días", tono: "vencida" });
  });
});
