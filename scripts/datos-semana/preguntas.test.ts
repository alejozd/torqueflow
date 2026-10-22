import { describe, expect, it } from "vitest";
import { confirmar, hacerPreguntas, validarRango, type Pregunton } from "./preguntas";

function falso(respuestas: string[]) {
  const textos: string[] = [];
  const p: Pregunton = {
    async preguntar(t) {
      textos.push(t);
      return respuestas.shift() ?? "";
    },
    cerrar() {},
  };
  return { p, textos };
}

const ctx = { sedes: [{ id: "s1", nombre: "Principal" }, { id: "s2", nombre: "Norte" }] };
// 2026-10-22 es jueves; el lunes de esa semana es 2026-10-19
const HOY = "2026-10-22";

describe("validarRango", () => {
  it("acepta un rango válido", () => {
    expect(validarRango("2026-10-19", "2026-10-22", HOY)).toBeNull();
  });
  it("rechaza formato inválido", () => {
    expect(validarRango("19/10/2026", "2026-10-22", HOY)).toMatch(/AAAA-MM-DD|formato/i);
    expect(validarRango("2026-10-19", "2026-13-40", HOY)).toMatch(/AAAA-MM-DD|formato/i);
  });
  it("rechaza fechas futuras", () => {
    expect(validarRango("2026-10-19", "2026-10-23", HOY)).toBe("No se permiten fechas futuras");
  });
  it("rechaza desde posterior a hasta", () => {
    expect(validarRango("2026-10-21", "2026-10-20", HOY)).toMatch(/desde/i);
  });
});

describe("hacerPreguntas", () => {
  it("usa defaults y la sede elegida", async () => {
    const { p } = falso(["", "", "2", "0", "bajo", "n"]);
    expect(await hacerPreguntas(p, ctx, HOY)).toEqual({
      desde: "2026-10-19", hasta: HOY, sedeIds: ["s2"], clientesNuevos: 0, volumen: "bajo", liquidar: false,
    });
  });
  it("todas las sedes, valores explícitos", async () => {
    const { p } = falso(["2026-10-20", "2026-10-21", "3", "5", "alto", "s"]);
    expect(await hacerPreguntas(p, ctx, HOY)).toEqual({
      desde: "2026-10-20", hasta: "2026-10-21", sedeIds: ["s1", "s2"], clientesNuevos: 5, volumen: "alto", liquidar: true,
    });
  });
  it("defaults de volumen y liquidar", async () => {
    const { p } = falso(["", "", "", "", "", ""]);
    const r = await hacerPreguntas(p, ctx, HOY);
    expect(r.volumen).toBe("medio");
    expect(r.liquidar).toBe(false);
    expect(r.sedeIds).toEqual(["s1", "s2"]);
  });
  it("repite ante un rango inválido con el mensaje", async () => {
    const { p, textos } = falso(["", "2026-10-30", "", "2026-10-21", "1", "0", "medio", "n"]);
    const r = await hacerPreguntas(p, ctx, HOY);
    expect(r.hasta).toBe("2026-10-21");
    expect(textos.some((t) => t.includes("No se permiten fechas futuras"))).toBe(true);
  });
  it("repite ante opciones inválidas", async () => {
    const { p, textos } = falso(["", "", "9", "1", "-2", "3", "enorme", "bajo", "x", "n"]);
    const r = await hacerPreguntas(p, ctx, HOY);
    expect(r).toMatchObject({ sedeIds: ["s1"], clientesNuevos: 3, volumen: "bajo", liquidar: false });
    expect(textos.filter((t) => t.includes("Opción no válida")).length).toBe(4);
  });
});

describe("confirmar", () => {
  it("true solo con s/si", async () => {
    expect(await confirmar(falso(["s"]).p, "resumen")).toBe(true);
    expect(await confirmar(falso(["SI"]).p, "resumen")).toBe(true);
    expect(await confirmar(falso([""]).p, "resumen")).toBe(false);
    expect(await confirmar(falso(["n"]).p, "resumen")).toBe(false);
  });
});
