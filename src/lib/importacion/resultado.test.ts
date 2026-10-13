import { describe, expect, it } from "vitest";
import { limitarFilas, resumenVacio, resultadoVacio, type FilaReporte } from "./resultado";

const novedad = (fila: number, tipo: FilaReporte["tipo"], hoja = "Clientes"): FilaReporte => ({
  hoja,
  fila,
  columna: null,
  valor: null,
  motivo: "x",
  tipo,
});

describe("reporte de importación", () => {
  it("empieza vacío y sin error", () => {
    expect(resultadoVacio()).toEqual({ error: null, resumen: [], filas: [], filasOcultas: 0 });
    expect(resultadoVacio("Archivo ilegible").error).toBe("Archivo ilegible");
    expect(resumenVacio("Clientes")).toEqual({
      hoja: "Clientes",
      leidas: 0,
      creadas: 0,
      existentes: 0,
      rechazadas: 0,
      estado: "ok",
      motivo: null,
    });
  });

  it("recorta las novedades visibles y cuenta las que oculta", () => {
    const filas = Array.from({ length: 205 }, (_, indice) => novedad(indice + 2, "rechazada"));

    const { visibles, ocultas } = limitarFilas(filas);

    expect(visibles).toHaveLength(200);
    expect(ocultas).toBe(5);
    expect(limitarFilas(filas.slice(0, 3))).toEqual({ visibles: filas.slice(0, 3), ocultas: 0 });
  });

  it("deja los rechazos delante de las filas que ya existían", () => {
    const existentes = Array.from({ length: 3 }, (_, indice) => novedad(indice + 2, "ya_existia"));
    const rechazos = [novedad(10, "rechazada"), novedad(11, "rechazada")];

    const { visibles } = limitarFilas([...existentes, ...rechazos]);

    // Los accionables no pueden quedar tapados por cientos de "ya existía".
    expect(visibles.map((fila) => fila.tipo)).toEqual(["rechazada", "rechazada", "ya_existia", "ya_existia", "ya_existia"]);
  });
});
