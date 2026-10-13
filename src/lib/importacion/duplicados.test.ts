import { describe, expect, it } from "vitest";
import {
  claveCodigo,
  claveDocumento,
  claveNombreCliente,
  claveNombreServicio,
  clavePlaca,
  separarDuplicados,
  setDeClaves,
} from "./duplicados";

describe("claves de duplicado", () => {
  it("normaliza y prefija cada tipo de clave", () => {
    expect(claveDocumento("1.020.456.789")).toBe("doc:1020456789");
    expect(claveNombreCliente("María  Pérez")).toBe("nom:mariaperez");
    expect(clavePlaca("abc-123")).toBe("placa:ABC123");
    expect(claveCodigo(" fil-001 ")).toBe("cod:FIL-001");
    expect(claveNombreServicio("Cambio de aceite")).toBe("serv:cambiodeaceite");
  });

  it("no confunde un documento con un nombre ni una placa con un código", () => {
    expect(claveDocumento("1020")).not.toBe(claveNombreCliente("1020"));
    expect(clavePlaca("ABC123")).not.toBe(claveCodigo("ABC123"));
  });

  it("devuelve null cuando no hay valor", () => {
    expect(claveDocumento("")).toBeNull();
    expect(claveDocumento("   ")).toBeNull();
    expect(claveDocumento(null)).toBeNull();
    expect(clavePlaca(undefined)).toBeNull();
  });

  it("setDeClaves ignora los huecos", () => {
    expect(setDeClaves([claveDocumento("1"), null, clavePlaca(""), clavePlaca("abc")])).toEqual(
      new Set(["doc:1", "placa:ABC"]),
    );
  });
});

describe("separarDuplicados", () => {
  const describir = (fila: { nombre: string }, clave: string) => `${clave} (${fila.nombre})`;

  it("separa lo nuevo de lo que ya existe y de lo repetido en el archivo", () => {
    const filas = [
      { numeroFila: 2, claves: ["doc:1"], nombre: "Ana" },
      { numeroFila: 3, claves: ["doc:2"], nombre: "Beto" },
      { numeroFila: 4, claves: ["doc:1"], nombre: "Ana repetida" },
      { numeroFila: 5, claves: ["doc:3"], nombre: "Caro" },
    ];

    const { nuevas, omitidas } = separarDuplicados(filas, setDeClaves(["doc:1"]), "Clientes", describir);

    expect(nuevas.map((fila) => fila.numeroFila)).toEqual([3, 5]);
    expect(omitidas).toEqual([
      {
        hoja: "Clientes",
        fila: 2,
        columna: null,
        valor: "doc:1 (Ana)",
        tipo: "ya_existia",
        motivo: "Ya existe en el sistema",
      },
      {
        hoja: "Clientes",
        fila: 4,
        columna: null,
        valor: "doc:1 (Ana repetida)",
        tipo: "ya_existia",
        motivo: "Ya existe en el sistema",
      },
    ]);
  });

  it("deja pasar dos filas que solo comparten una clave secundaria distinta", () => {
    const filas = [
      { numeroFila: 2, claves: ["doc:1", "nom:ana"], nombre: "Ana" },
      { numeroFila: 3, claves: ["doc:9"], nombre: "Otra Ana" },
    ];

    const { nuevas, omitidas } = separarDuplicados(filas, new Set<string>(), "Clientes", describir);

    expect(nuevas).toHaveLength(2);
    expect(omitidas).toEqual([]);
  });

  it("marca la segunda aparición de una misma clave en el archivo", () => {
    const filas = [
      { numeroFila: 2, claves: ["placa:ABC123"], nombre: "Uno" },
      { numeroFila: 3, claves: ["placa:ABC123"], nombre: "Dos" },
      { numeroFila: 4, claves: ["placa:ABC123"], nombre: "Tres" },
    ];

    const { nuevas, omitidas } = separarDuplicados(filas, new Set<string>(), "Vehículos", describir);

    expect(nuevas.map((fila) => fila.numeroFila)).toEqual([2]);
    expect(omitidas.map((fila) => [fila.fila, fila.motivo])).toEqual([
      [3, "Está repetida en este mismo archivo"],
      [4, "Está repetida en este mismo archivo"],
    ]);
  });
});
