import { requireRole } from "@/lib/auth/guards";
import { getCartera } from "@/app/actions/cartera-actions";
import { getCuentasPorPagar } from "@/app/actions/cuenta-por-pagar-actions";
import { getMostradorDatos } from "@/app/actions/venta-mostrador-actions";
import { listCajasCerradas } from "@/app/actions/caja-actions";
import { hojaArqueos, hojaCartera, hojaCuentasPorPagar, hojaVentasDelDia } from "@/lib/exportacion/reportes";
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
 */

export const dynamic = "force-dynamic";

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const REPORTES = ["cartera", "cuentas-por-pagar", "ventas-hoy", "arqueos"] as const;
type Reporte = (typeof REPORTES)[number];

function esReporte(valor: string): valor is Reporte {
  return (REPORTES as readonly string[]).includes(valor);
}

async function construirHojas(reporte: Reporte): Promise<HojaEscrita[]> {
  switch (reporte) {
    case "cartera": {
      const vista = await getCartera({});
      return [hojaCartera(vista)];
    }
    case "cuentas-por-pagar": {
      const { proveedores, totales } = await getCuentasPorPagar();
      return [hojaCuentasPorPagar(proveedores, totales)];
    }
    case "ventas-hoy": {
      const { ventas } = await getMostradorDatos();
      return [hojaVentasDelDia(ventas)];
    }
    case "arqueos": {
      const filas = await listCajasCerradas({});
      return [hojaArqueos(filas)];
    }
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reporte: string }> },
): Promise<Response> {
  const { reporte } = await params;
  // El rol primero: un reporte inexistente y uno prohibido responden igual.
  await requireRole(["ADMIN", "RECEPCION"]);
  if (!esReporte(reporte)) {
    return new Response("Reporte no encontrado", { status: 404 });
  }

  const archivo = await escribirLibro(await construirHojas(reporte));
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": TIPO_XLSX,
      "Content-Disposition": `attachment; filename="${reporte}-${hoy}.xlsx"`,
      "Content-Length": String(archivo.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
