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

  const extension = MIME_EXTENSIONS[file.type];
  const filename = `${randomUUID()}.${extension}`;
  const relativeSegments = [tenantSchema, "dvi", dviId, filename];
  const absoluteDir = path.join(getUploadsRoot(), tenantSchema, "dvi", dviId);

  await mkdir(absoluteDir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(absoluteDir, filename), buffer);

  const relativePath = relativeSegments.join("/");
  return { relativePath, url: `/api/uploads/${relativePath}` };
}
