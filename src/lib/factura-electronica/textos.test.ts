import { describe, expect, it } from "vitest";
import { ENVIO_INTERRUMPIDO_MS as ENVIO_INTERRUMPIDO_MS_SERVICIO } from "./servicio";
import {
  ENVIO_INTERRUMPIDO_MS,
  TEXTO_ESTADO_DIAN,
  cuentaParaDian,
  estadoDian,
  necesitaAtencionDian,
  textoEstadoDian,
} from "./textos";

const AHORA = new Date("2026-11-21T12:00:00.000Z");

describe("textos del estado DIAN", () => {
  it("sin documento es SIN_ENVIAR; con documento, su estado", () => {
    expect(estadoDian(null, AHORA)).toBe("SIN_ENVIAR");
    expect(estadoDian(undefined, AHORA)).toBe("SIN_ENVIAR");
    expect(estadoDian({ estado: "ACEPTADO", ultimoIntentoAt: null }, AHORA)).toBe("ACEPTADO");
  });

  it("un envío interrumpido (ENVIANDO hace más del límite o sin fecha) queda por confirmar", () => {
    const hace = (ms: number) => new Date(AHORA.getTime() - ms);
    expect(estadoDian({ estado: "ENVIANDO", ultimoIntentoAt: hace(30_000) }, AHORA)).toBe("ENVIANDO");
    expect(estadoDian({ estado: "ENVIANDO", ultimoIntentoAt: hace(ENVIO_INTERRUMPIDO_MS + 1) }, AHORA)).toBe("POR_CONFIRMAR");
    expect(estadoDian({ estado: "ENVIANDO", ultimoIntentoAt: null }, AHORA)).toBe("POR_CONFIRMAR");
    expect(necesitaAtencionDian(estadoDian({ estado: "ENVIANDO", ultimoIntentoAt: null }, AHORA))).toBe(true);
  });

  it("el límite del envío interrumpido es el mismo del servicio", () => {
    expect(ENVIO_INTERRUMPIDO_MS).toBe(ENVIO_INTERRUMPIDO_MS_SERVICIO);
  });

  it("aceptada en Simulado o Pruebas no se presenta como válida", () => {
    expect(textoEstadoDian("ACEPTADO", "PRODUCCION")).toEqual(TEXTO_ESTADO_DIAN.ACEPTADO);
    expect(textoEstadoDian("ACEPTADO")).toEqual(TEXTO_ESTADO_DIAN.ACEPTADO);
    expect(textoEstadoDian("ACEPTADO", "SIMULADO")).toEqual({
      etiqueta: "Aceptada en Simulado",
      descripcion: "Se aceptó en el ambiente de Simulado: no tiene validez ante la DIAN.",
      tono: "neutro",
    });
    expect(textoEstadoDian("ACEPTADO", "PRUEBAS")).toEqual({
      etiqueta: "Aceptada en Pruebas",
      descripcion: "Se aceptó en el ambiente de Pruebas: no tiene validez ante la DIAN.",
      tono: "neutro",
    });
    expect(textoEstadoDian("RECHAZADO", "PRUEBAS")).toEqual(TEXTO_ESTADO_DIAN.RECHAZADO);
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
