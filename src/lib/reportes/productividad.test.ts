import { describe, expect, it } from "vitest";
import { computeProductividad, SIN_ASIGNAR_LABEL } from "./productividad";

describe("computeProductividad", () => {
  it("returns an empty list for an empty range", () => {
    expect(computeProductividad([])).toEqual([]);
  });

  it("groups several órdenes under the same técnico and sums hours and amount", () => {
    const filas = computeProductividad([
      { mecanicoId: "t1", mecanicoNombre: "Ana", manoDeObra: [{ horas: 1.5, precioHora: 20 }] },
      { mecanicoId: "t1", mecanicoNombre: "Ana", manoDeObra: [{ horas: 2, precioHora: 20 }] },
    ]);

    expect(filas).toEqual([
      {
        mecanicoId: "t1",
        mecanicoNombre: "Ana",
        ordenesCompletadas: 2,
        horasManoDeObra: 3.5,
        montoManoDeObra: 70,
      },
    ]);
  });

  it("buckets órdenes with no mecánico under 'Sin asignar' instead of dropping them", () => {
    const filas = computeProductividad([
      { mecanicoId: null, mecanicoNombre: null, manoDeObra: [{ horas: 1, precioHora: 40 }] },
    ]);

    expect(filas).toEqual([
      {
        mecanicoId: null,
        mecanicoNombre: SIN_ASIGNAR_LABEL,
        ordenesCompletadas: 1,
        horasManoDeObra: 1,
        montoManoDeObra: 40,
      },
    ]);
  });

  it("counts an orden with no mano de obra lines as completed with zero hours", () => {
    const filas = computeProductividad([{ mecanicoId: "t1", mecanicoNombre: "Ana", manoDeObra: [] }]);

    expect(filas[0]).toEqual({
      mecanicoId: "t1",
      mecanicoNombre: "Ana",
      ordenesCompletadas: 1,
      horasManoDeObra: 0,
      montoManoDeObra: 0,
    });
  });

  it("sorts by billed amount descending", () => {
    const filas = computeProductividad([
      { mecanicoId: "t1", mecanicoNombre: "Ana", manoDeObra: [{ horas: 1, precioHora: 10 }] },
      { mecanicoId: "t2", mecanicoNombre: "Beto", manoDeObra: [{ horas: 1, precioHora: 30 }] },
      { mecanicoId: null, mecanicoNombre: null, manoDeObra: [] },
    ]);

    expect(filas.map((fila) => fila.mecanicoNombre)).toEqual(["Beto", "Ana", SIN_ASIGNAR_LABEL]);
  });

  it("breaks amount ties alphabetically by name", () => {
    const filas = computeProductividad([
      { mecanicoId: "t2", mecanicoNombre: "Zoe", manoDeObra: [{ horas: 1, precioHora: 10 }] },
      { mecanicoId: "t1", mecanicoNombre: "Ana", manoDeObra: [{ horas: 1, precioHora: 10 }] },
    ]);

    expect(filas.map((fila) => fila.mecanicoNombre)).toEqual(["Ana", "Zoe"]);
  });

  it("rounds hours and amount to two decimals", () => {
    const filas = computeProductividad([
      { mecanicoId: "t1", mecanicoNombre: "Ana", manoDeObra: [{ horas: 0.333, precioHora: 3 }] },
    ]);

    expect(filas[0].horasManoDeObra).toBe(0.33);
    expect(filas[0].montoManoDeObra).toBe(1);
  });
});
