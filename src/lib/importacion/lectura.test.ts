import { describe, expect, it } from "vitest";
import { porNombre } from "./test-utils";
import { leerHoja, valorDeColumna } from "./lectura";

describe("leerHoja", () => {
  it("numera las filas como en Excel y salta las vacías sin perder la cuenta", () => {
    const lectura = leerHoja(porNombre("Clientes"), [
      ["Nombre", "Documento"],
      ["Ana", "1"],
      [],
      ["", "  "],
      ["Beto", "2"],
    ]);

    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;
    expect(lectura.filas.map((fila) => fila.numeroFila)).toEqual([2, 5]);
    expect(valorDeColumna(lectura.indices, lectura.filas[0]!, "nombre")).toBe("Ana");
  });

  it("encuentra el encabezado aunque no esté en la primera fila", () => {
    const lectura = leerHoja(porNombre("Servicios"), [
      ["Catálogo de servicios 2026"],
      [],
      ["Nombre", "Precio mano de obra"],
      ["Alineación", "45.000"],
    ]);

    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;
    expect(lectura.filas).toHaveLength(1);
    expect(lectura.filas[0]!.numeroFila).toBe(4);
  });

  it("descarta la hoja entera si falta una columna obligatoria", () => {
    const lectura = leerHoja(porNombre("Repuestos"), [["Nombre", "Precio venta"], ["Filtro", "25.000"]]);

    expect(lectura.ok).toBe(false);
    if (lectura.ok) return;
    expect(lectura.motivo).toBe("Faltan columnas obligatorias: Código, Precio compra");
  });

  it("avisa si la hoja no tiene datos", () => {
    expect(leerHoja(porNombre("Clientes"), [])).toEqual({ ok: false, motivo: "La hoja no tiene datos" });
    expect(leerHoja(porNombre("Clientes"), [[], ["", ""]])).toEqual({
      ok: false,
      motivo: "La hoja no tiene datos",
    });
  });

  it("respeta el tope de filas por hoja con un solo aviso y cuenta las que sobran", () => {
    const filas: unknown[][] = [["Nombre", "Documento"]];
    for (let indice = 1; indice <= 2003; indice += 1) filas.push([`Cliente ${indice}`, String(indice)]);

    const lectura = leerHoja(porNombre("Clientes"), filas);

    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;
    expect(lectura.filas).toHaveLength(2000);
    expect(lectura.filasSobrantes).toBe(3);
    expect(lectura.rechazos).toEqual([
      {
        hoja: "Clientes",
        fila: 2002,
        columna: null,
        valor: null,
        tipo: "rechazada",
        motivo: "La hoja trae 3 fila(s) de más: solo se importan las primeras 2000",
      },
    ]);
  });
});
