import { describe, expect, it } from "vitest";
import { contarPorFiltro, filtrarVencimientos } from "./filtro-lista";

const aviso = { canal: "WHATSAPP" as const, enviadoAt: new Date("2026-10-10T00:00:00Z") };
const filas = [
  { id: "a", tipo: "SOAT" as const, estado: "VENCIDO" as const, ultimoAviso: null },
  { id: "b", tipo: "SOAT" as const, estado: "PROXIMO" as const, ultimoAviso: aviso },
  { id: "c", tipo: "TECNOMECANICA" as const, estado: "PROXIMO" as const, ultimoAviso: null },
  { id: "d", tipo: "TECNOMECANICA" as const, estado: "POR_VENCER" as const, ultimoAviso: null },
];

describe("filtrarVencimientos", () => {
  it("TODOS devuelve todo", () => {
    expect(filtrarVencimientos(filas, "TODOS", "TODOS").map((f) => f.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("separa vence pronto de por vencer", () => {
    expect(filtrarVencimientos(filas, "TODOS", "PROXIMO").map((f) => f.id)).toEqual(["b", "c"]);
    expect(filtrarVencimientos(filas, "TODOS", "POR_VENCER").map((f) => f.id)).toEqual(["d"]);
  });
  it("sin avisar excluye los que tienen último aviso", () => {
    expect(filtrarVencimientos(filas, "TODOS", "SIN_AVISAR").map((f) => f.id)).toEqual(["a", "c", "d"]);
  });
  it("combina documento y filtro rápido", () => {
    expect(filtrarVencimientos(filas, "TECNOMECANICA", "PROXIMO").map((f) => f.id)).toEqual(["c"]);
  });
});

describe("contarPorFiltro", () => {
  it("cuenta cada chip", () => {
    expect(contarPorFiltro(filas, "TODOS")).toEqual({ TODOS: 4, VENCIDO: 1, PROXIMO: 2, POR_VENCER: 1, SIN_AVISAR: 3 });
  });
  it("respeta el documento elegido", () => {
    expect(contarPorFiltro(filas, "SOAT")).toEqual({ TODOS: 2, VENCIDO: 1, PROXIMO: 1, POR_VENCER: 0, SIN_AVISAR: 1 });
  });
});
