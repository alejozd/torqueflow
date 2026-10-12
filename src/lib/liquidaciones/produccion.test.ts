import { describe, expect, it } from "vitest";
import { SIN_ASIGNAR_LABEL, atribuirManoDeObra, computeProduccionPorMecanico, type OrdenProduccion } from "./produccion";

function linea(valor: number, mecanicoId: string | null = null, mecanicoNombre: string | null = null) {
  return { valor, mecanicoId, mecanicoNombre };
}

describe("atribuirManoDeObra", () => {
  it("atribuye cada línea a su mecánico y, si no tiene, al de la orden (D3)", () => {
    const orden: OrdenProduccion = {
      mecanicoId: "t1",
      mecanicoNombre: "Ana",
      manoDeObra: [linea(30000), linea(20000, "t2", "Beto")],
    };

    expect(atribuirManoDeObra(orden)).toEqual([
      { mecanicoId: "t1", mecanicoNombre: "Ana", valor: 30000 },
      { mecanicoId: "t2", mecanicoNombre: "Beto", valor: 20000 },
    ]);
  });

  it("sin mecánico en la orden ni en la línea queda sin asignar", () => {
    expect(atribuirManoDeObra({ mecanicoId: null, mecanicoNombre: null, manoDeObra: [linea(15000)] })).toEqual([
      { mecanicoId: null, mecanicoNombre: null, valor: 15000 },
    ]);
  });

  it("una orden sin líneas no atribuye nada", () => {
    expect(atribuirManoDeObra({ mecanicoId: "t1", mecanicoNombre: "Ana", manoDeObra: [] })).toEqual([]);
  });
});

describe("computeProduccionPorMecanico", () => {
  it("sin órdenes no hay filas", () => {
    expect(computeProduccionPorMecanico([])).toEqual([]);
  });

  it("cuenta órdenes y trabajos por mecánico", () => {
    const filas = computeProduccionPorMecanico([
      { mecanicoId: "t1", mecanicoNombre: "Ana", manoDeObra: [linea(30000), linea(20000)] },
      { mecanicoId: "t1", mecanicoNombre: "Ana", manoDeObra: [linea(10000)] },
    ]);

    expect(filas).toEqual([
      { mecanicoId: "t1", mecanicoNombre: "Ana", ordenes: 2, trabajos: 3, montoManoObra: 60000 },
    ]);
  });

  it("una orden con dos mecánicos reparte los trabajos y deja las órdenes en su asignado", () => {
    const filas = computeProduccionPorMecanico([
      {
        mecanicoId: "t1",
        mecanicoNombre: "Ana",
        manoDeObra: [linea(30000), linea(20000, "t2", "Beto"), linea(5000, "t2", "Beto")],
      },
    ]);

    expect(filas).toEqual([
      { mecanicoId: "t1", mecanicoNombre: "Ana", ordenes: 1, trabajos: 1, montoManoObra: 30000 },
      { mecanicoId: "t2", mecanicoNombre: "Beto", ordenes: 0, trabajos: 2, montoManoObra: 25000 },
    ]);
  });

  it("una orden sin líneas sigue contando como entregada por su mecánico", () => {
    expect(
      computeProduccionPorMecanico([{ mecanicoId: "t1", mecanicoNombre: "Ana", manoDeObra: [] }]),
    ).toEqual([{ mecanicoId: "t1", mecanicoNombre: "Ana", ordenes: 1, trabajos: 0, montoManoObra: 0 }]);
  });

  it("agrupa el trabajo sin mecánico bajo 'Sin asignar'", () => {
    const filas = computeProduccionPorMecanico([
      { mecanicoId: null, mecanicoNombre: null, manoDeObra: [linea(15000), linea(5000)] },
    ]);

    expect(filas).toEqual([
      { mecanicoId: null, mecanicoNombre: SIN_ASIGNAR_LABEL, ordenes: 1, trabajos: 2, montoManoObra: 20000 },
    ]);
  });

  it("ordena por monto y, a igual monto, por nombre", () => {
    const filas = computeProduccionPorMecanico([
      { mecanicoId: "t1", mecanicoNombre: "Ana", manoDeObra: [linea(10000)] },
      { mecanicoId: "t2", mecanicoNombre: "Beto", manoDeObra: [linea(30000)] },
      { mecanicoId: null, mecanicoNombre: null, manoDeObra: [linea(20000)] },
    ]);

    expect(filas.map((fila) => fila.mecanicoNombre)).toEqual(["Beto", SIN_ASIGNAR_LABEL, "Ana"]);
  });

  it("redondea la mano de obra a dos decimales", () => {
    const filas = computeProduccionPorMecanico([
      { mecanicoId: "t1", mecanicoNombre: "Ana", manoDeObra: [linea(0.1), linea(0.2)] },
    ]);

    expect(filas[0]!.montoManoObra).toBe(0.3);
  });
});
