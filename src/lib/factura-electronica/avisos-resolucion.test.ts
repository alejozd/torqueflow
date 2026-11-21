import { describe, expect, it } from "vitest";
import { avisosResolucion } from "./avisos-resolucion";

describe("avisosResolucion", () => {
  it("sin avisos cuando sobra rango y vigencia", () => {
    expect(avisosResolucion({ rangoHasta: 5000, vigenciaHasta: "2027-12-31", siguienteConsecutivo: 10 }, "2026-11-21")).toEqual([]);
  });

  it("avisa cuando quedan 100 números o menos", () => {
    expect(avisosResolucion({ rangoHasta: 1000, vigenciaHasta: "2027-12-31", siguienteConsecutivo: 901 }, "2026-11-21")).toEqual([
      "Quedan 100 números de la resolución. Pide una nueva a la DIAN.",
    ]);
  });

  it("avisa cuando el rango se agotó", () => {
    expect(avisosResolucion({ rangoHasta: 1000, vigenciaHasta: "2027-12-31", siguienteConsecutivo: 1001 }, "2026-11-21")).toEqual([
      "Se acabaron los números de la resolución: no se pueden enviar facturas hasta registrar una nueva.",
    ]);
  });

  it("avisa cuando faltan 30 días o menos de vigencia, y cuando ya venció", () => {
    expect(avisosResolucion({ rangoHasta: 5000, vigenciaHasta: "2026-12-21", siguienteConsecutivo: 1 }, "2026-11-21")).toEqual([
      "La resolución vence en 30 días (2026-12-21).",
    ]);
    expect(avisosResolucion({ rangoHasta: 5000, vigenciaHasta: "2026-11-20", siguienteConsecutivo: 1 }, "2026-11-21")).toEqual([
      "La resolución venció el 2026-11-20: no se pueden enviar facturas hasta registrar una nueva.",
    ]);
  });

  it("sin datos de resolución no avisa nada", () => {
    expect(avisosResolucion({ rangoHasta: null, vigenciaHasta: null, siguienteConsecutivo: 1 }, "2026-11-21")).toEqual([]);
  });
});
