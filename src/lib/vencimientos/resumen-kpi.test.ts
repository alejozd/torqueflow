import { describe, expect, it } from "vitest";
import { resumenKpiVencimientos } from "./resumen-kpi";

describe("resumenKpiVencimientos", () => {
  it("sin nada por vencer lo dice, para que el 0 se entienda", () => {
    expect(resumenKpiVencimientos([])).toEqual({ total: 0, subtitulo: "SOAT y tecnomecánica al día" });
  });

  it("separa los vencidos de los que están por vencer", () => {
    const filas = [{ estado: "VENCIDO" }, { estado: "PROXIMO" }, { estado: "POR_VENCER" }] as const;

    expect(resumenKpiVencimientos(filas)).toEqual({ total: 3, subtitulo: "1 vencido · 2 por vencer" });
  });

  it("omite la parte que vale cero y usa plural", () => {
    expect(resumenKpiVencimientos([{ estado: "VENCIDO" }, { estado: "VENCIDO" }])).toEqual({
      total: 2,
      subtitulo: "2 vencidos",
    });
    expect(resumenKpiVencimientos([{ estado: "PROXIMO" }])).toEqual({ total: 1, subtitulo: "1 por vencer" });
  });
});
