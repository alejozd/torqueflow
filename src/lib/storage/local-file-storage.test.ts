import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { saveDviFoto } from "./local-file-storage";

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
