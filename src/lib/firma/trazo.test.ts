import { describe, expect, it, vi } from "vitest";
import { aPathD, agregarPunto, distancia, hayTrazo, limitarPunto, pintarTrazos } from "./trazo";

describe("agregarPunto", () => {
  it("acumula puntos separados y descarta los que están pegados", () => {
    let trazo = agregarPunto([], { x: 10, y: 10 });
    trazo = agregarPunto(trazo, { x: 10.5, y: 10.5 }); // a menos de 1.5 px del anterior
    trazo = agregarPunto(trazo, { x: 40, y: 30 });

    expect(trazo).toEqual([
      { x: 10, y: 10 },
      { x: 40, y: 30 },
    ]);
  });

  it("respeta una distancia mínima distinta", () => {
    const trazo = agregarPunto(agregarPunto([], { x: 0, y: 0 }), { x: 5, y: 0 }, 10);

    expect(trazo).toHaveLength(1);
  });
});

describe("hayTrazo", () => {
  it("un clic suelto no es una firma", () => {
    expect(hayTrazo([])).toBe(false);
    expect(hayTrazo([[]])).toBe(false);
    expect(hayTrazo([[{ x: 1, y: 1 }]])).toBe(false);
    expect(hayTrazo([[{ x: 1, y: 1 }], [{ x: 2, y: 2 }, { x: 3, y: 3 }]])).toBe(true);
  });
});

describe("limitarPunto", () => {
  it("deja el punto dentro del canvas", () => {
    expect(limitarPunto({ x: -5, y: 200 }, 300, 150)).toEqual({ x: 0, y: 150 });
    expect(limitarPunto({ x: 10, y: 20 }, 300, 150)).toEqual({ x: 10, y: 20 });
  });
});

describe("aPathD y pintarTrazos", () => {
  it("construye el path de un trazo y vacío sin puntos", () => {
    expect(aPathD([])).toBe("");
    expect(aPathD([{ x: 1, y: 2 }])).toBe("M 1 2");
    expect(aPathD([{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }])).toBe("M 1 2 L 3 4 L 5 6");
  });

  it("pinta cada trazo y limpia antes", () => {
    const contexto = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    };

    pintarTrazos(contexto, [[{ x: 1, y: 1 }, { x: 2, y: 2 }], [], [{ x: 9, y: 9 }]], 300, 150);

    expect(contexto.clearRect).toHaveBeenCalledWith(0, 0, 300, 150);
    // Dos trazos con contenido: el vacío y el de un solo punto no se pintan.
    expect(contexto.beginPath).toHaveBeenCalledTimes(1);
    expect(contexto.moveTo).toHaveBeenCalledWith(1, 1);
    expect(contexto.lineTo).toHaveBeenCalledWith(2, 2);
    expect(contexto.stroke).toHaveBeenCalledTimes(1);
  });

  it("la distancia es euclídea", () => {
    expect(distancia({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});
