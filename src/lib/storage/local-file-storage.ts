import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
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

/** Extensiones que la ruta de descarga sabe servir (y por tanto las únicas borrables). */
const EXTENSIONES_PERMITIDAS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const PREFIJO_URL = "/api/uploads/";

/**
 * Valida y escribe un archivo bajo `<UPLOADS_DIR>/<segmentos…>/<uuid>.<ext>`. Es
 * el único sitio que toca el disco: cada entrada pública decide sus segmentos.
 */
async function guardarArchivo(segments: string[], file: File): Promise<SavedUpload> {
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
  const relativeSegments = [...segments, filename];
  const absoluteDir = path.join(getUploadsRoot(), ...segments);

  await mkdir(absoluteDir, { recursive: true });
  await writeFile(path.join(absoluteDir, filename), buffer);

  const relativePath = relativeSegments.join("/");
  return { relativePath, url: `${PREFIJO_URL}${relativePath}` };
}

export async function saveDviFoto(tenantSchema: string, dviId: string, file: File): Promise<SavedUpload> {
  return guardarArchivo([tenantSchema, "dvi", dviId], file);
}

/** Qué se guarda de una orden: la firma dibujada o la foto del acta firmada. */
export type TipoArchivoOrden = "acta" | "firma";

/**
 * Archivos de la orden (Fase 21): `<tenant>/ordenes/<ordenId>/<tipo>/<uuid>.<ext>`.
 * La firma de pantalla llega como PNG y la foto del acta como jpeg/png/webp: las
 * dos pasan por las mismas validaciones de MIME, tamaño y magic bytes.
 */
export async function saveOrdenArchivo(
  tenantSchema: string,
  ordenId: string,
  tipo: TipoArchivoOrden,
  file: File,
): Promise<SavedUpload> {
  return guardarArchivo([tenantSchema, "ordenes", ordenId, tipo], file);
}

/**
 * Borra el archivo de una orden a partir de su URL de `/api/uploads/...`, siempre
 * dentro de la raíz del tenant de la sesión y de `ordenes/`: se resuelve la ruta
 * y se comprueba con el **mismo** criterio que la ruta de descarga
 * (`src/app/api/uploads/[...path]/route.ts`), comparando contra la raíz del
 * tenant más el separador para que un directorio hermano con el mismo prefijo no
 * pase. Exigir el subdirectorio evita que un id manipulado borre, por ejemplo,
 * una foto del DVI.
 *
 * Devuelve si borró algo; que el archivo ya no esté no es un error (borrar dos
 * veces no falla).
 */
export async function borrarArchivoDeOrden(tenantSchema: string, url: string): Promise<boolean> {
  if (!url.startsWith(PREFIJO_URL)) return false;

  const segments = url.slice(PREFIJO_URL.length).split("/").filter(Boolean);
  if (segments[0] !== tenantSchema || segments[1] !== "ordenes") return false;

  const uploadsRoot = getUploadsRoot();
  const tenantRoot = path.join(uploadsRoot, tenantSchema);
  const requestedPath = path.join(uploadsRoot, ...segments);
  const tenantRootWithSep = tenantRoot + path.sep;

  if (requestedPath !== tenantRoot && !requestedPath.startsWith(tenantRootWithSep)) return false;
  if (!EXTENSIONES_PERMITIDAS.has(path.extname(requestedPath).toLowerCase())) return false;

  try {
    await unlink(requestedPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
