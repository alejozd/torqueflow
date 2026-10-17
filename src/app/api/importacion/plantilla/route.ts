import { requirePermiso } from "@/lib/auth/guards";
import { construirPlantilla } from "@/lib/importacion/plantilla";

/** La plantilla se genera al momento: no se cachea ni se sirve estática. */
export const dynamic = "force-dynamic";

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const NOMBRE_ARCHIVO = "plantilla-importacion-torqueflow.xlsx";

/**
 * Descarga de la plantilla de importación (Fase 20). Es un GET autenticado, como
 * el resto de descargas de archivos del proyecto (`src/app/api/uploads/...`):
 * solo ADMIN y RECEPCION pueden importar.
 */
export async function GET() {
  await requirePermiso("importar.usar");

  const archivo = await construirPlantilla();

  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": TIPO_XLSX,
      "Content-Disposition": `attachment; filename="${NOMBRE_ARCHIVO}"`,
      "Content-Length": String(archivo.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
