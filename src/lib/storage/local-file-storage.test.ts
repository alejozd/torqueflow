import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { borrarArchivoDeOrden, saveDviFoto, saveOrdenArchivo } from "./local-file-storage";

let uploadsDir: string;
const originalUploadsDir = process.env.UPLOADS_DIR;

beforeEach(async () => {
  uploadsDir = await mkdtemp(path.join(tmpdir(), "torqueflow-uploads-"));
  process.env.UPLOADS_DIR = uploadsDir;
});

afterEach(async () => {
  await rm(uploadsDir, { recursive: true, force: true });
  process.env.UPLOADS_DIR = originalUploadsDir;
});

function makeFile(bytes: Uint8Array, type: string, name = "foto.jpg"): File {
  return new File([bytes as BlobPart], name, { type });
}

const JPEG_MAGIC = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0];
const WEBP_MAGIC = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];

describe("saveDviFoto", () => {
  it("writes the file under <UPLOADS_DIR>/<tenantSchema>/dvi/<dviId>/ and returns a matching url", async () => {
    const bytes = new Uint8Array(JPEG_MAGIC);
    const file = makeFile(bytes, "image/jpeg");

    const saved = await saveDviFoto("taller_perez", "dvi1", file);

    expect(saved.url).toMatch(/^\/api\/uploads\/taller_perez\/dvi\/dvi1\/[^/]+\.jpg$/);
    const writtenPath = path.join(uploadsDir, saved.relativePath);
    const contents = await readFile(writtenPath);
    expect(Array.from(contents)).toEqual(Array.from(bytes));
  });

  it("rejects a disallowed mime type", async () => {
    const file = makeFile(new Uint8Array([1]), "application/pdf", "doc.pdf");

    await expect(saveDviFoto("taller_perez", "dvi1", file)).rejects.toThrow(/no permitido/);
  });

  it("rejects a file over the 5 MB limit", async () => {
    const oversized = new Uint8Array(5 * 1024 * 1024 + 1);
    const file = makeFile(oversized, "image/png", "big.png");

    await expect(saveDviFoto("taller_perez", "dvi1", file)).rejects.toThrow(/tamaño máximo/);
  });

  it("rejects a file claiming image/jpeg but with non-JPEG magic bytes", async () => {
    const file = makeFile(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), "image/jpeg");

    await expect(saveDviFoto("taller_perez", "dvi1", file)).rejects.toThrow(/imagen válida/);
  });

  it("accepts a genuine PNG file with matching claimed type", async () => {
    const bytes = new Uint8Array(PNG_MAGIC);
    const file = makeFile(bytes, "image/png", "foto.png");

    const saved = await saveDviFoto("taller_perez", "dvi1", file);

    expect(saved.url).toMatch(/\.png$/);
  });

  it("accepts a genuine WEBP file with matching claimed type", async () => {
    const bytes = new Uint8Array(WEBP_MAGIC);
    const file = makeFile(bytes, "image/webp", "foto.webp");

    const saved = await saveDviFoto("taller_perez", "dvi1", file);

    expect(saved.url).toMatch(/\.webp$/);
  });
});

describe("saveOrdenArchivo", () => {
  it("guarda la firma y la foto del acta bajo ordenes/<ordenId>/<tipo>/", async () => {
    const firma = await saveOrdenArchivo("taller_perez", "o1", "firma", makeFile(new Uint8Array(PNG_MAGIC), "image/png", "firma.png"));
    const acta = await saveOrdenArchivo("taller_perez", "o1", "acta", makeFile(new Uint8Array(JPEG_MAGIC), "image/jpeg", "acta.jpg"));

    expect(firma.url).toMatch(/^\/api\/uploads\/taller_perez\/ordenes\/o1\/firma\/[^/]+\.png$/);
    expect(acta.url).toMatch(/^\/api\/uploads\/taller_perez\/ordenes\/o1\/acta\/[^/]+\.jpg$/);
    // Los dos archivos están de verdad en disco.
    await expect(readFile(path.join(uploadsDir, firma.relativePath))).resolves.toBeTruthy();
    await expect(readFile(path.join(uploadsDir, acta.relativePath))).resolves.toBeTruthy();
  });

  it("mantiene las validaciones: MIME no permitido y magic bytes falsos", async () => {
    await expect(
      saveOrdenArchivo("taller_perez", "o1", "acta", makeFile(new Uint8Array([1]), "application/pdf", "acta.pdf")),
    ).rejects.toThrow(/no permitido/);
    await expect(
      saveOrdenArchivo("taller_perez", "o1", "firma", makeFile(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), "image/png")),
    ).rejects.toThrow(/imagen válida/);
  });
});

describe("borrarArchivoDeOrden", () => {
  async function existe(ruta: string): Promise<boolean> {
    try {
      await readFile(ruta);
      return true;
    } catch {
      return false;
    }
  }

  it("borra el archivo guardado y no falla si se pide otra vez", async () => {
    const guardado = await saveOrdenArchivo(
      "taller_perez",
      "o1",
      "firma",
      makeFile(new Uint8Array(PNG_MAGIC), "image/png", "firma.png"),
    );
    const enDisco = path.join(uploadsDir, guardado.relativePath);

    await expect(borrarArchivoDeOrden("taller_perez", guardado.url)).resolves.toBe(true);
    await expect(existe(enDisco)).resolves.toBe(false);
    await expect(borrarArchivoDeOrden("taller_perez", guardado.url)).resolves.toBe(false);
  });

  it("no borra nada fuera de la raíz del tenant, ni con otra extensión, ni con URL ajena", async () => {
    // Archivo de otro tenant que un intento de travesía no debe alcanzar.
    const victima = path.join(uploadsDir, "otro_taller", "secreto.png");
    await guardarArchivoDePrueba(victima);

    const intentos = [
      "/api/uploads/taller_perez/../../otro_taller/secreto.png",
      "/api/uploads/otro_taller/secreto.png",
      "/api/uploads/taller_perez/ordenes/o1/firma/archivo.pdf",
      "https://ejemplo.com/api/uploads/taller_perez/ordenes/o1/firma/x.png",
      "/tmp/archivo.png",
    ];
    for (const url of intentos) {
      await expect(borrarArchivoDeOrden("taller_perez", url)).resolves.toBe(false);
    }

    await expect(existe(victima)).resolves.toBe(true);
  });

  it("no acepta '..' aunque la ruta empiece por ordenes/ (hallazgo B7)", async () => {
    const fotoDvi = path.join(uploadsDir, "taller_perez", "dvi", "x", "foto.png");
    await guardarArchivoDePrueba(fotoDvi);

    for (const url of [
      "/api/uploads/taller_perez/ordenes/../dvi/x/foto.png",
      "/api/uploads/taller_perez/ordenes/o1/./../../dvi/x/foto.png",
      String.raw`/api/uploads/taller_perez/ordenes/o1/firma\..\..\..\dvi\x\foto.png`,
    ]) {
      await expect(borrarArchivoDeOrden("taller_perez", url)).resolves.toBe(false);
    }
    await expect(existe(fotoDvi)).resolves.toBe(true);
  });

  it("no borra archivos de la orden que no estén bajo ordenes/ (por ejemplo una foto del DVI)", async () => {
    const fotoDvi = path.join(uploadsDir, "taller_perez", "dvi", "foto.png");
    await guardarArchivoDePrueba(fotoDvi);

    await expect(borrarArchivoDeOrden("taller_perez", "/api/uploads/taller_perez/dvi/foto.png")).resolves.toBe(false);
    await expect(existe(fotoDvi)).resolves.toBe(true);
  });
});

/** Escribe un archivo arbitrario dentro de UPLOADS_DIR (para el caso de travesía). */
async function guardarArchivoDePrueba(destino: string): Promise<void> {
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, new Uint8Array(PNG_MAGIC));
}
