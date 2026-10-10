import { describe, expect, it } from "vitest";
import {
  diasHastaVencimiento,
  estadoVencimiento,
  fechaLimiteAviso,
  requiereAviso,
} from "./estado-vencimiento";

// 2026-10-10 a las 22:00 en Bogotá = 2026-10-11T03:00Z: el día calendario sigue siendo el 10.
const AHORA = new Date("2026-10-11T03:00:00Z");
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("diasHastaVencimiento", () => {
  it("cuenta por día calendario de Bogotá, no por instante UTC", () => {
    expect(diasHastaVencimiento(d("2026-10-10"), AHORA)).toBe(0);
    expect(diasHastaVencimiento(d("2026-10-11"), AHORA)).toBe(1);
    expect(diasHastaVencimiento(d("2026-10-09"), AHORA)).toBe(-1);
  });
});

describe("estadoVencimiento", () => {
  it("SIN_DATO sin fecha", () => {
    expect(estadoVencimiento(null, AHORA, 30)).toBe("SIN_DATO");
  });

  it("bordes con diasAviso = 30", () => {
    expect(estadoVencimiento(d("2026-10-09"), AHORA, 30)).toBe("VENCIDO");
    expect(estadoVencimiento(d("2026-10-10"), AHORA, 30)).toBe("PROXIMO");
    expect(estadoVencimiento(d("2026-10-17"), AHORA, 30)).toBe("PROXIMO");
    expect(estadoVencimiento(d("2026-10-18"), AHORA, 30)).toBe("POR_VENCER");
    expect(estadoVencimiento(d("2026-11-09"), AHORA, 30)).toBe("POR_VENCER");
    expect(estadoVencimiento(d("2026-11-10"), AHORA, 30)).toBe("VIGENTE");
  });

  it("con diasAviso menor que 7, PROXIMO no se sale de la ventana", () => {
    expect(estadoVencimiento(d("2026-10-15"), AHORA, 5)).toBe("PROXIMO");
    expect(estadoVencimiento(d("2026-10-16"), AHORA, 5)).toBe("VIGENTE");
  });
});

describe("requiereAviso", () => {
  it("solo PROXIMO, POR_VENCER y VENCIDO", () => {
    expect(["SIN_DATO", "VIGENTE", "POR_VENCER", "PROXIMO", "VENCIDO"].map((e) => requiereAviso(e as never))).toEqual([
      false,
      false,
      true,
      true,
      true,
    ]);
  });
});

describe("fechaLimiteAviso", () => {
  it("devuelve medianoche UTC del día hoy + diasAviso (Bogotá)", () => {
    expect(fechaLimiteAviso(AHORA, 30).toISOString()).toBe("2026-11-09T00:00:00.000Z");
  });
});
