// src/lib/factura-electronica/almacenamiento.test.ts
// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { crearProveedorSimulado, ErrorProveedor, type ProveedorFacturaElectronica } from "@/modulos/factura-electronica";
import { guardarArchivosDocumento } from "./almacenamiento";

let uploadsDir: string;
const uploadsOriginal = process.env.UPLOADS_DIR;

beforeEach(async () => {
  uploadsDir = await mkdtemp(path.join(tmpdir(), "torqueflow-fe-"));
  process.env.UPLOADS_DIR = uploadsDir;
});

afterEach(async () => {
  await rm(uploadsDir, { recursive: true, force: true });
  process.env.UPLOADS_DIR = uploadsOriginal;
});

const ref = { tipo: "FACTURA" as const, prefijo: "SETP", numero: 990000001 };

describe("guardarArchivosDocumento", () => {
  it("descarga y guarda XML y PDF con el nombre del documento", async () => {
    const r = await guardarArchivosDocumento(crearProveedorSimulado(), ref, "taller_perez", "doc1");
    expect(r).toEqual({
      xmlRuta: "/api/uploads/taller_perez/facturas-electronicas/doc1/FES-SETP990000001.xml",
      pdfRuta: "/api/uploads/taller_perez/facturas-electronicas/doc1/FES-SETP990000001.pdf",
      errores: [],
    });
  });

  it("si la descarga falla no lanza: deja las rutas en null y cuenta los errores", async () => {
    const proveedor: ProveedorFacturaElectronica = {
      ...crearProveedorSimulado(),
      descargar: async () => {
        throw new ErrorProveedor("No se pudo descargar (código 404).");
      },
    };
    const r = await guardarArchivosDocumento(proveedor, ref, "taller_perez", "doc1");
    expect(r.xmlRuta).toBeNull();
    expect(r.pdfRuta).toBeNull();
    expect(r.errores).toHaveLength(2);
  });
});
