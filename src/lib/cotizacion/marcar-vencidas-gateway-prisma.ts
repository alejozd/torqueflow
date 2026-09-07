import { getTenantDb } from "@/lib/db/tenant-client";
import type { CotizacionesVencidasGateway } from "./marcar-vencidas";

/**
 * The only Prisma-aware piece of the VENCIDA sweep. `validaHasta` is nullable
 * (Cotizacion.validaHasta DateTime? in schema.prisma) -- the `lt: ahora`
 * filter naturally excludes rows where it's null, which is correct: a
 * cotización with no expiry date should never auto-expire.
 */
export const prismaCotizacionesVencidasGateway: CotizacionesVencidasGateway = {
  async marcarVencidas(schemaName, ahora) {
    const tenantDb = getTenantDb(schemaName);
    const resultado = await tenantDb.cotizacion.updateMany({
      where: { estado: "ENVIADA", validaHasta: { lt: ahora } },
      data: { estado: "VENCIDA" },
    });
    return resultado.count;
  },
};
