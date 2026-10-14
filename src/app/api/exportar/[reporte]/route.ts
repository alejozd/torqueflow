import { requireRole } from "@/lib/auth/guards";
import { getCartera } from "@/app/actions/cartera-actions";
import { getCuentasPorPagar } from "@/app/actions/cuenta-por-pagar-actions";
import { getTenantDb } from "@/lib/db/tenant-client";
import { arqueosDelRango, ventasDelRango } from "@/lib/exportacion/consultas";
import { resolverRangoExportacion, tieneRango, type RangoExportacion } from "@/lib/exportacion/rango-fechas";
import { hojaArqueos, hojaCartera, hojaCuentasPorPagar, hojaVentas } from "@/lib/exportacion/reportes";
import { escribirLibro, type HojaEscrita } from "@/lib/importacion/xlsx";

/**
 * Descarga de reportes en Excel (Fase 24, D10). Es un GET autenticado, como el
 * resto de descargas del proyecto.
 *
 * Tres reglas:
 * - **La sede sale de la sesión**, nunca de un parámetro: los reportes de dinero
 *   no pueden sacar datos de otra sede aunque se manipule la URL.
 * - Se exige el mismo rol que puede ver estos reportes en pantalla (ADMIN y
 *   RECEPCION). Un técnico no exporta el dinero del taller.
 * - El archivo se genera en memoria y viaja en la respuesta: no toca el disco.
 *
 * Ventas y arqueos aceptan `?desde=AAAA-MM-DD&hasta=AAAA-MM-DD` (consolidación,
 * D9): validado aquí, máximo 366 días, por defecto el mes en curso. Un rango
 * inválido responde 400 sin consultar nada.
 */

export const dynamic = "force-dynamic";

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const REPORTES = ["cartera", "cuentas-por-pagar", "ventas", "arqueos"] as const;
type Reporte = (typeof REPORTES)[number];

function esReporte(valor: string): valor is Reporte {
  return (REPORTES as readonly string[]).includes(valor);
}

type Sesion = Awaited<ReturnType<typeof requireRole>>;

async function construirHojas(reporte: Reporte, session: Sesion, rango: RangoExportacion | null): Promise<HojaEscrita[]> {
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const sedeId = session.user.sedeActivaId;
  switch (reporte) {
    case "cartera": {
      const vista = await getCartera({});
      return [hojaCartera(vista)];
    }
    case "cuentas-por-pagar": {
      const { proveedores, totales } = await getCuentasPorPagar();
      return [hojaCuentasPorPagar(proveedores, totales)];
    }
    case "ventas":
      return [hojaVentas(await ventasDelRango(tenantDb, sedeId, rango!))];
    case "arqueos":
      return [hojaArqueos(await arqueosDelRango(tenantDb, sedeId, rango!))];
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ reporte: string }> },
): Promise<Response> {
  const { reporte } = await params;
  // El rol primero: un reporte inexistente y uno prohibido responden igual.
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  if (!esReporte(reporte)) {
    return new Response("Reporte no encontrado", { status: 404 });
  }

  let rango: RangoExportacion | null = null;
  if (tieneRango(reporte)) {
    const { searchParams } = new URL(request.url);
    const resultado = resolverRangoExportacion(
      { desde: searchParams.get("desde"), hasta: searchParams.get("hasta") },
      new Date(),
    );
    if ("error" in resultado) return new Response(resultado.error, { status: 400 });
    rango = resultado.rango;
  }

  const archivo = await escribirLibro(await construirHojas(reporte, session, rango));
  const sufijo = rango
    ? `${rango.desde}-a-${rango.hasta}`
    : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": TIPO_XLSX,
      "Content-Disposition": `attachment; filename="${reporte}-${sufijo}.xlsx"`,
      "Content-Length": String(archivo.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
