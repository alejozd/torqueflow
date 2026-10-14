import { describe, expect, it } from "vitest";
import { construirPlantilla } from "./plantilla";
import { armarZip } from "./test-utils";
import { verificarZipAcotado } from "./zip-seguro";

const MB = 1024 * 1024;

describe("verificarZipAcotado", () => {
  it("acepta un zip pequeño, comprimido o no", () => {
    const zip = armarZip([
      { nombre: "a.xml", datos: Buffer.from("<a/>".repeat(100)) },
      { nombre: "b.xml", datos: Buffer.from("hola"), metodo: 0 },
    ]);

    expect(verificarZipAcotado(zip, MB)).toEqual({ ok: true });
  });

  it("acepta entradas con los tamaños en un descriptor posterior (LibreOffice)", () => {
    const zip = armarZip([
      { nombre: "a.xml", datos: Buffer.from("<a/>".repeat(50)), conDescriptor: true },
      { nombre: "b.xml", datos: Buffer.from("<b/>"), conDescriptor: true },
    ]);

    expect(verificarZipAcotado(zip, MB)).toEqual({ ok: true });
    // Y el tope sigue midiendo lo descomprimido de verdad.
    const bomba = armarZip([{ nombre: "s.xml", datos: Buffer.alloc(5 * MB), conDescriptor: true }]);
    expect(verificarZipAcotado(bomba, MB)).toEqual({ ok: false, motivo: "demasiado-grande" });
  });

  it("acepta la plantilla oficial de importación", async () => {
    const plantilla = await construirPlantilla();

    expect(verificarZipAcotado(plantilla, 40 * MB)).toEqual({ ok: true });
  });

  it("rechaza una bomba zip: pocos KB que descomprimen a más del tope", () => {
    const bomba = armarZip([{ nombre: "xl/worksheets/sheet1.xml", datos: Buffer.alloc(50 * MB) }]);
    expect(bomba.length).toBeLessThan(200 * 1024);

    const resultado = verificarZipAcotado(bomba, 40 * MB);

    expect(resultado).toEqual({ ok: false, motivo: "demasiado-grande" });
  });

  it("no se fía del tamaño declarado: mide lo que de verdad descomprime", () => {
    const mentirosa = armarZip([{ nombre: "sheet1.xml", datos: Buffer.alloc(3 * MB), declarado: 10 }]);

    expect(verificarZipAcotado(mentirosa, 2 * MB)).toEqual({ ok: false, motivo: "demasiado-grande" });
  });

  it("suma todas las entradas contra el mismo tope", () => {
    const zip = armarZip([
      { nombre: "a.xml", datos: Buffer.alloc(MB) },
      { nombre: "b.xml", datos: Buffer.alloc(MB) },
      { nombre: "c.xml", datos: Buffer.alloc(MB) },
    ]);

    expect(verificarZipAcotado(zip, 2.5 * MB)).toEqual({ ok: false, motivo: "demasiado-grande" });
    expect(verificarZipAcotado(zip, 4 * MB)).toEqual({ ok: true });
  });

  it("rechaza una entrada escondida que el directorio central no lista", () => {
    const zip = armarZip(
      [
        { nombre: "a.xml", datos: Buffer.from("<a/>") },
        { nombre: "escondida.xml", datos: Buffer.from("<b/>") },
      ],
      { omitirDelDirectorio: 1 },
    );

    expect(verificarZipAcotado(zip, MB)).toEqual({ ok: false, motivo: "invalido" });
  });

  it("rechaza lo que no es un zip", () => {
    expect(verificarZipAcotado(Buffer.from("esto no es un excel"), MB)).toEqual({ ok: false, motivo: "invalido" });
    expect(verificarZipAcotado(Buffer.alloc(0), MB)).toEqual({ ok: false, motivo: "invalido" });
  });
});
