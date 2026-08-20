import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const ALLOWED_UPLOAD_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;

type AllowedMimeType = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];

const MIME_EXTENSIONS: Record<AllowedMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function hasValidMagicBytes(buffer: Buffer, type: AllowedMimeType): boolean {
  switch (type) {
    case "image/jpeg":
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "image/png":
      return (
        buffer.length >= 8 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
      );
    case "image/webp":
      return (
        buffer.length >= 12 &&
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46 &&
        buffer[8] === 0x57 &&
        buffer[9] === 0x45 &&
        buffer[10] === 0x42 &&
        buffer[11] === 0x50
      );
    default:
      return false;
  }
}

export function getUploadsRoot(): string {
  return process.env.UPLOADS_DIR ?? path.join(process.cwd(), "uploads");
}

function isAllowedMimeType(type: string): type is AllowedMimeType {
  return (ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(type);
}

export interface SavedUpload {
  relativePath: string;
  url: string;
}

export async function saveDviFoto(tenantSchema: string, dviId: string, file: File): Promise<SavedUpload> {
  if (!isAllowedMimeType(file.type)) {
    throw new Error(`Tipo de archivo no permitido: ${file.type}`);
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error("El archivo supera el tamaño máximo permitido (5 MB)");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!hasValidMagicBytes(buffer, file.type)) {
    throw new Error("El archivo no es una imagen válida");
  }

  const extension = MIME_EXTENSIONS[file.type];
  const filename = `${randomUUID()}.${extension}`;
  const relativeSegments = [tenantSchema, "dvi", dviId, filename];
  const absoluteDir = path.join(getUploadsRoot(), tenantSchema, "dvi", dviId);

  await mkdir(absoluteDir, { recursive: true });
  await writeFile(path.join(absoluteDir, filename), buffer);

  const relativePath = relativeSegments.join("/");
  return { relativePath, url: `/api/uploads/${relativePath}` };
}
