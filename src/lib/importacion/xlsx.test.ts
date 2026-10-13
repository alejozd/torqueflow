import { describe, expect, it } from "vitest";
import { leerLibro, escribirLibro } from "./xlsx";

describe("escribirLibro y leerLibro", () => {
  it("hace ida y vuelta de un libro de varias hojas", async () => {
    const bytes = await escribirLibro([
      { nombre: "Clientes", filas: [["Nombre", "Teléfono"], ["María Pérez", "310 555 1234"]], anchos: [20, 16] },
      { nombre: "Otros", filas: [["Dato"], ["x"]] },
    ]);

    const hojas = await leerLibro(bytes);

    expect(hojas.map((hoja) => hoja.nombre)).toEqual(["Clientes", "Otros"]);
    expect(hojas[0]!.filas[0]).toEqual(["Nombre", "Teléfono"]);
    expect(hojas[0]!.filas[1]).toEqual(["María Pérez", "310 555 1234"]);
    expect(hojas[1]!.filas).toEqual([["Dato"], ["x"]]);
  });

  it("Excel decide el tipo de la celda: los números vuelven como número", async () => {
    const bytes = await escribirLibro([{ nombre: "Hoja", filas: [["Año", "Precio"], [2021, 1500.5]] }]);

    const [hoja] = await leerLibro(bytes);

    expect(hoja!.filas[1]).toEqual([2021, 1500.5]);
  });

  it("acepta un File, que es lo que llega del formulario", async () => {
    const bytes = await escribirLibro([{ nombre: "Clientes", filas: [["Nombre"], ["Ana"]] }]);
    const archivo = new File([new Uint8Array(bytes)], "clientes.xlsx");

    const [hoja] = await leerLibro(archivo);

    expect(hoja!.nombre).toBe("Clientes");
    expect(hoja!.filas[1]).toEqual(["Ana"]);
  });

  it("rechaza un archivo que no es un xlsx", async () => {
    await expect(leerLibro(Buffer.from("esto no es un libro de Excel"))).rejects.toThrow();
  });
});
