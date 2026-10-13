import { describe, expect, it } from "vitest";
import {
  ALERTAS_VALIDAS,
  ETIQUETA_FILTRO_ALERTA,
  SORT_KEYS,
  construirHrefOrdenes,
  filtrarPorAlerta,
  parseAlerta,
  parseEstado,
  parseOrder,
  parseSort,
  parseVista,
} from "./filtros-ordenes";

describe("parseo de la URL", () => {
  it("acepta solo valores del catálogo", () => {
    expect(parseEstado("EN_PROCESO")).toBe("EN_PROCESO");
    expect(parseEstado("EN_PROCESO;DROP")).toBeUndefined();
    expect(parseEstado(undefined)).toBeUndefined();

    expect(parseAlerta("ESTANCADA")).toBe("ESTANCADA");
    expect(parseAlerta("TERMINADA_SIN_ENTREGAR")).toBe("TERMINADA_SIN_ENTREGAR");
    expect(parseAlerta("cualquiera")).toBeUndefined();

    expect(parseSort("prioridad")).toBe("prioridad");
    expect(parseSort("inventado")).toBeUndefined();
  });

  it("el orden y la vista tienen un valor por defecto claro", () => {
    expect(parseOrder("asc")).toBe("asc");
    expect(parseOrder("desc")).toBe("desc");
    expect(parseOrder(undefined)).toBe("desc");
    expect(parseVista("tablero")).toBe("tablero");
    expect(parseVista(undefined)).toBe("tabla");
    expect(parseVista("otra")).toBe("tabla");
  });

  it("la prioridad es una clave de orden más", () => {
    expect(SORT_KEYS).toContain("prioridad");
    expect(ALERTAS_VALIDAS).toEqual(["ESTANCADA", "TERMINADA_SIN_ENTREGAR"]);
    expect(ETIQUETA_FILTRO_ALERTA.TERMINADA_SIN_ENTREGAR).toBe("Sin entregar");
  });
});

describe("construirHrefOrdenes", () => {
  it("sin parámetros va al listado limpio", () => {
    expect(construirHrefOrdenes({})).toBe("/ordenes");
    // La vista por defecto no se ensucia en la URL.
    expect(construirHrefOrdenes({ vista: "tabla" })).toBe("/ordenes");
  });

  it("conserva estado, vista, orden y alerta a la vez", () => {
    const href = construirHrefOrdenes({
      estado: "EN_PROCESO",
      vista: "tablero",
      sort: "prioridad",
      order: "asc",
      alerta: "ESTANCADA",
    });

    expect(href).toBe("/ordenes?estado=EN_PROCESO&vista=tablero&sort=prioridad&order=asc&alerta=ESTANCADA");
  });

  it("no escribe order sin sort, y no escribe order=desc (es el defecto)", () => {
    expect(construirHrefOrdenes({ order: "asc" })).toBe("/ordenes");
    expect(construirHrefOrdenes({ sort: "fecha", order: "desc" })).toBe("/ordenes?sort=fecha");
  });
});

describe("filtrarPorAlerta", () => {
  const ordenes = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const motivos = new Map([
    ["a", "ESTANCADA" as const],
    ["b", "TERMINADA_SIN_ENTREGAR" as const],
  ]);

  it("sin filtro devuelve todo", () => {
    expect(filtrarPorAlerta(ordenes, undefined, motivos)).toEqual(ordenes);
  });

  it("deja solo las órdenes con ese motivo", () => {
    expect(filtrarPorAlerta(ordenes, "ESTANCADA", motivos).map((orden) => orden.id)).toEqual(["a"]);
    expect(filtrarPorAlerta(ordenes, "TERMINADA_SIN_ENTREGAR", motivos).map((orden) => orden.id)).toEqual(["b"]);
  });

  it("una orden con otro motivo no se cuela", () => {
    expect(filtrarPorAlerta(ordenes, "ESTANCADA", new Map([["c", "TERMINADA_SIN_ENTREGAR" as const]]))).toEqual([]);
  });
});
