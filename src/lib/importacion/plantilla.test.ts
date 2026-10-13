import { describe, expect, it } from "vitest";
import { HOJAS, HOJA_INSTRUCCIONES, resolverColumnas } from "./hojas";
import { construirPlantilla, NOTA_OBLIGATORIAS } from "./plantilla";
import { leerLibro } from "./xlsx";

describe("construirPlantilla", () => {
  it("trae una hoja por entidad más las instrucciones", async () => {
    const hojas = await leerLibro(await construirPlantilla());

    expect(hojas.map((hoja) => hoja.nombre)).toEqual([...HOJAS.map((hoja) => hoja.nombre), HOJA_INSTRUCCIONES]);
  });

  it("cada hoja es legible por el propio importador (ida y vuelta del contrato)", async () => {
    const hojas = await leerLibro(await construirPlantilla());

    for (const contrato of HOJAS) {
      const hoja = hojas.find((candidata) => candidata.nombre === contrato.nombre)!;
      const encabezados = hoja.filas[0]!;
      const { indices, faltantes } = resolverColumnas(contrato, encabezados);

      expect(faltantes, `faltan columnas obligatorias en ${contrato.nombre}`).toEqual([]);
      expect(indices.size).toBe(contrato.columnas.length);
    }
  });

  it("trae la fila de ejemplo con un valor por columna", async () => {
    const hojas = await leerLibro(await construirPlantilla());

    for (const contrato of HOJAS) {
      const hoja = hojas.find((candidata) => candidata.nombre === contrato.nombre)!;
      expect(hoja.filas[1]).toEqual(contrato.columnas.map((columna) => columna.ejemplo));
    }
  });

  it("marca las obligatorias y lo explica en las instrucciones", async () => {
    const hojas = await leerLibro(await construirPlantilla());
    const clientes = hojas.find((hoja) => hoja.nombre === "Clientes")!;

    expect(clientes.filas[0]![0]).toBe("Nombre *");
    expect(clientes.filas[0]![1]).toBe("Documento");

    const instrucciones = hojas.find((hoja) => hoja.nombre === HOJA_INSTRUCCIONES)!;
    const texto = instrucciones.filas.flat().join(" ");
    expect(texto).toContain(NOTA_OBLIGATORIAS);
    expect(texto).toContain("Nada se sobrescribe");
    expect(texto).toContain("cantidad inicial");
  });
});
