// src/lib/factura-electronica/hora-bogota.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fechaHoraBogota } from "./hora-bogota";

describe("fechaHoraBogota", () => {
  it("resta las 5 horas de Colombia, también al cambiar de día", () => {
    expect(fechaHoraBogota(new Date("2026-11-21T03:30:05Z"))).toEqual({ fecha: "2026-11-20", hora: "22:30:05" });
  });

  it("la medianoche sale como 00:00:00 (no 24:00:00)", () => {
    expect(fechaHoraBogota(new Date("2026-11-20T05:00:00Z"))).toEqual({ fecha: "2026-11-20", hora: "00:00:00" });
  });
});
