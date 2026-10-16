import { describe, expect, it } from "vitest";
import {
  ATAJOS, PERIODOS, ayudaFecha, diasEntre, duracionTexto, fechaDeAtajo, formatoDiaLargoConAnio,
  formatoNumerico, leerFechaEscrita, periodoDe, relativoTexto, sumarMesesDia, textoRango,
} from "./fechas-campo";

// Viernes 16 de octubre de 2026.
const HOY = "2026-10-16";

describe("sumarMesesDia", () => {
  it("suma meses conservando el día", () => expect(sumarMesesDia("2026-10-16", 12)).toBe("2027-10-16"));
  it("recorta al último día del mes", () => expect(sumarMesesDia("2026-01-31", 1)).toBe("2026-02-28"));
  it("resta meses cruzando el año", () => expect(sumarMesesDia("2026-01-15", -2)).toBe("2025-11-15"));
});

describe("duracionTexto y relativoTexto", () => {
  it.each([
    [1, "1 día"], [5, "5 días"], [14, "14 días"], [30, "30 días"], [31, "1 mes"], [49, "2 meses"],
    [60, "2 meses"], [212, "7 meses"], [365, "1 año"], [365 + 61, "1 año y 2 meses"], [-4, "4 días"],
  ])("%i días -> %s", (dias, texto) => expect(duracionTexto(dias)).toBe(texto));

  it.each([
    ["2026-10-16", "hoy"], ["2026-10-15", "ayer"], ["2026-10-17", "mañana"],
    ["2026-10-19", "en 3 días"], ["2026-10-02", "hace 14 días"],
  ])("%s -> %s", (iso, texto) => expect(relativoTexto(iso, HOY)).toBe(texto));

  it("diasEntre tiene signo", () => {
    expect(diasEntre(HOY, "2026-10-12")).toBe(-4);
    expect(diasEntre(HOY, "2027-10-16")).toBe(365);
  });
});

describe("formatos", () => {
  it("día largo sin año si es el año actual", () => expect(formatoDiaLargoConAnio("2026-10-16", HOY)).toBe("viernes 16 de octubre"));
  it("día largo con año si es otro año", () => expect(formatoDiaLargoConAnio("2027-05-16", HOY)).toBe("domingo 16 de mayo de 2027"));
  it("numérico dd/mm/aaaa", () => expect(formatoNumerico("2026-03-05")).toBe("05/03/2026"));
});

describe("leerFechaEscrita", () => {
  it.each([
    ["16/10/2026", "2026-10-16"], ["1/2/2027", "2027-02-01"], ["16-10-26", "2026-10-16"],
    ["16.10.2026", "2026-10-16"], [" 29/02/2028 ", "2028-02-29"],
  ])("%s -> %s", (texto, iso) => expect(leerFechaEscrita(texto)).toBe(iso));
  it.each(["", "16/13/2026", "31/04/2026", "29/02/2027", "2026-10-16", "hoy"])("rechaza %s", (texto) =>
    expect(leerFechaEscrita(texto)).toBeNull(),
  );
});

describe("atajos", () => {
  it("vencimiento ofrece 6 meses y 1 año", () => {
    expect(ATAJOS.vencimiento.map((a) => a.etiqueta)).toEqual(["En 6 meses", "En 1 año"]);
    expect(fechaDeAtajo(ATAJOS.vencimiento[1], HOY)).toBe("2027-10-16");
  });
  it("pasado ofrece Hoy y Ayer", () => {
    expect(ATAJOS.pasado.map((a) => fechaDeAtajo(a, HOY))).toEqual(["2026-10-16", "2026-10-15"]);
  });
  it("seguimiento, cotización, mantenimiento y garantía", () => {
    expect(ATAJOS.seguimiento.map((a) => a.etiqueta)).toEqual(["Mañana", "En 3 días", "En 1 semana"]);
    expect(ATAJOS.cotizacion.map((a) => a.etiqueta)).toEqual(["En 8 días", "En 15 días", "En 30 días"]);
    expect(ATAJOS.mantenimiento.map((a) => a.etiqueta)).toEqual(["En 3 meses", "En 6 meses"]);
    expect(ATAJOS.garantia.map((a) => a.etiqueta)).toEqual(["En 3 meses", "En 6 meses", "En 1 año"]);
  });
});

describe("ayudaFecha", () => {
  it("vencimiento: ok, aviso a 30 días o menos, vencido", () => {
    expect(ayudaFecha("vencimiento", "2027-05-16", HOY)).toEqual({ texto: "Vence en 7 meses", tono: "ok" });
    expect(ayudaFecha("vencimiento", "2026-11-03", HOY)).toEqual({ texto: "Vence en 18 días", tono: "aviso" });
    expect(ayudaFecha("vencimiento", HOY, HOY)).toEqual({ texto: "Vence hoy", tono: "vencido" });
    expect(ayudaFecha("vencimiento", "2026-10-12", HOY)).toEqual({ texto: "Venció hace 4 días", tono: "vencido" });
    expect(ayudaFecha("vencimiento", null, HOY)).toEqual({ texto: "Sin fecha", tono: "neutro" });
  });
  it("garantía usa los mismos textos que vencimiento", () => {
    expect(ayudaFecha("garantia", "2027-04-16", HOY)).toEqual({ texto: "Vence en 6 meses", tono: "ok" });
  });
  it("mantenimiento", () => {
    expect(ayudaFecha("mantenimiento", "2026-11-03", HOY)).toEqual({ texto: "Faltan 18 días", tono: "aviso" });
    expect(ayudaFecha("mantenimiento", HOY, HOY)).toEqual({ texto: "Es hoy", tono: "aviso" });
    expect(ayudaFecha("mantenimiento", "2026-10-12", HOY)).toEqual({ texto: "Se pasó hace 4 días", tono: "vencido" });
  });
  it("pasado, cotización y seguimiento", () => {
    expect(ayudaFecha("pasado", "2026-10-15", HOY)).toEqual({ texto: "Ayer", tono: "neutro" });
    expect(ayudaFecha("cotizacion", "2026-10-31", HOY)).toEqual({ texto: "El cliente tiene 15 días para aceptarla", tono: "neutro" });
    expect(ayudaFecha("cotizacion", HOY, HOY)).toEqual({ texto: "Vence hoy", tono: "aviso" });
    expect(ayudaFecha("seguimiento", "2026-10-19", HOY)).toEqual({ texto: "Volver a llamar en 3 días", tono: "neutro" });
  });
  it("sin valor: null salvo vencimiento, garantía y mantenimiento", () => {
    expect(ayudaFecha("pasado", null, HOY)).toBeNull();
    expect(ayudaFecha("mantenimiento", null, HOY)).toEqual({ texto: "Sin fecha", tono: "neutro" });
  });
});

describe("periodos", () => {
  const rango = (etiqueta: string) => PERIODOS.find((p) => p.etiqueta === etiqueta)!.rango(HOY);
  it("calcula cada periodo (la semana empieza el lunes)", () => {
    expect(rango("Hoy")).toEqual(["2026-10-16", "2026-10-16"]);
    expect(rango("Ayer")).toEqual(["2026-10-15", "2026-10-15"]);
    expect(rango("Esta semana")).toEqual(["2026-10-12", "2026-10-16"]);
    expect(rango("Semana pasada")).toEqual(["2026-10-05", "2026-10-11"]);
    expect(rango("Este mes")).toEqual(["2026-10-01", "2026-10-16"]);
    expect(rango("Mes pasado")).toEqual(["2026-09-01", "2026-09-30"]);
    expect(rango("Últimos 30 días")).toEqual(["2026-09-17", "2026-10-16"]);
    expect(rango("Este año")).toEqual(["2026-01-01", "2026-10-16"]);
  });
  it("periodoDe reconoce el periodo o devuelve -1", () => {
    expect(PERIODOS[periodoDe("2026-10-01", "2026-10-16", HOY)].etiqueta).toBe("Este mes");
    expect(periodoDe("2026-10-03", "2026-10-09", HOY)).toBe(-1);
  });
  it("textoRango", () => {
    expect(textoRango("2026-10-01", "2026-10-16", HOY)).toBe("1 – 16 de octubre");
    expect(textoRango("2026-09-20", "2026-10-05", HOY)).toBe("20 de septiembre – 5 de octubre");
    expect(textoRango("2025-12-20", "2026-01-05", HOY)).toBe("20 dic 2025 – 5 ene 2026");
    expect(textoRango("2026-10-16", "2026-10-16", HOY)).toBe("Viernes 16 de octubre");
  });
});
