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

describe("saveDviFoto", () => {
  it("writes the file under <UPLOADS_DIR>/<tenantSchema>/dvi/<dviId>/ and returns a matching url", async () => {
    const file = makeFile(new Uint8Array([1, 2, 3]), "image/jpeg");

    const saved = await saveDviFoto("taller_perez", "dvi1", file);

    expect(saved.url).toMatch(/^\/api\/uploads\/taller_perez\/dvi\/dvi1\/[^/]+\.jpg$/);
    const writtenPath = path.join(uploadsDir, saved.relativePath);
    const contents = await readFile(writtenPath);
    expect(Array.from(contents)).toEqual([1, 2, 3]);
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
});
