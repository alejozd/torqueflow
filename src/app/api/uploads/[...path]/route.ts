import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireSession } from "@/lib/auth/guards";
import { getUploadsRoot } from "@/lib/storage/local-file-storage";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const session = await requireSession();
  const { path: segments } = await params;

  if (segments[0] !== session.user.tenantSchema) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const uploadsRoot = getUploadsRoot();
  const tenantRoot = path.join(uploadsRoot, session.user.tenantSchema);
  const requestedPath = path.join(uploadsRoot, ...segments);

  // Compare against tenantRoot + a trailing separator (not just tenantRoot) so a
  // sibling directory whose name merely starts with the tenant schema as a string
  // prefix (e.g. "taller_perez-evil" vs "taller_perez") cannot pass this check via
  // a ".."-based traversal segment.
  const tenantRootWithSep = tenantRoot + path.sep;
  if (requestedPath !== tenantRoot && !requestedPath.startsWith(tenantRootWithSep)) {
    return NextResponse.json({ error: "Ruta inválida" }, { status: 400 });
  }

  const extension = path.extname(requestedPath).toLowerCase();
  const contentType = CONTENT_TYPES[extension];
  if (!contentType) {
    return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
  }

  try {
    const file = await readFile(requestedPath);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
  }
}
