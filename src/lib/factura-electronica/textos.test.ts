import { describe, expect, it } from "vitest";
import { TEXTO_ESTADO_DIAN, cuentaParaDian, estadoDian, necesitaAtencionDian } from "./textos";

describe("textos del estado DIAN", () => {
  it("sin documento es SIN_ENVIAR; con documento, su estado", () => {
    expect(estadoDian(null)).toBe("SIN_ENVIAR");
    expect(estadoDian(undefined)).toBe("SIN_ENVIAR");
    expect(estadoDian({ estado: "ACEPTADO" })).toBe("ACEPTADO");
  });

  it("necesitan atención: sin enviar, pendiente, por confirmar y rechazada", () => {
    expect(["SIN_ENVIAR", "PENDIENTE", "POR_CONFIRMAR", "RECHAZADO"].every((e) => necesitaAtencionDian(e as never))).toBe(true);
    expect(["ENVIANDO", "ACEPTADO", "ANULADO"].some((e) => necesitaAtencionDian(e as never))).toBe(false);
  });

  it("solo cuentan las facturas creadas desde la activación", () => {
    const activada = new Date("2026-11-01T00:00:00Z");
    expect(cuentaParaDian(new Date("2026-11-02T00:00:00Z"), activada)).toBe(true);
    expect(cuentaParaDian(new Date("2026-10-31T00:00:00Z"), activada)).toBe(false);
    expect(cuentaParaDian(new Date(), null)).toBe(false);
  });

  it("cada estado tiene etiqueta en lenguaje sencillo", () => {
    expect(TEXTO_ESTADO_DIAN.ACEPTADO.etiqueta).toBe("Aceptada por la DIAN");
    expect(TEXTO_ESTADO_DIAN.RECHAZADO.tono).toBe("error");
    expect(TEXTO_ESTADO_DIAN.SIN_ENVIAR.etiqueta).toBe("Sin enviar a la DIAN");
  });
});
