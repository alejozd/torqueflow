import "dotenv/config";
import { publicDb } from "@/lib/db/public-client";
import { getTenantDb } from "@/lib/db/tenant-client";
import { recalcularCotizacionesAbiertas } from "@/lib/cotizacion/recalcular-abiertas";

/**
 * Tanda 3 (IVA incluido): correr una sola vez, justo después de aplicar la
 * migración 20261118120000_iva_incluido en cada taller. Recalcula los totales
 * guardados de las cotizaciones abiertas con la regla nueva.
 *
 *   npx tsx scripts/cli/recalcular-cotizaciones-iva-incluido.ts
 */
async function main() {
  const tenants = await publicDb.tenant.findMany({ select: { schemaName: true } });
  for (const tenant of tenants) {
    const recalculadas = await recalcularCotizacionesAbiertas(getTenantDb(tenant.schemaName));
    console.log(`${tenant.schemaName}: ${recalculadas} cotización(es) abierta(s) recalculada(s).`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
