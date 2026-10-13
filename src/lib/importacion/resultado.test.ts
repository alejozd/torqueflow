import { describe, expect, it } from "vitest";
import { contarNovedades, limitarFilas, resumenVacio, resultadoVacio, type FilaReporte } from "./resultado";

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

  it("cuenta por hoja y por tipo de novedad", () => {
    const filas = [
      novedad(2, "rechazada"),
      novedad(3, "ya_existia"),
      novedad(4, "ya_existia"),
      novedad(2, "rechazada", "Repuestos"),
    ];

    expect(contarNovedades(filas, "Clientes")).toEqual({ rechazadas: 1, existentes: 2 });
    expect(contarNovedades(filas, "Repuestos")).toEqual({ rechazadas: 1, existentes: 0 });
    expect(contarNovedades(filas, "Servicios")).toEqual({ rechazadas: 0, existentes: 0 });
  });
});
