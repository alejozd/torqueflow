/**
 * The VENCIDA batch flip, expressed without a single Prisma import.
 *
 * Mirrors src/lib/recordatorios/ejecutar-recordatorios.ts's DB-free-core /
 * Prisma-gateway / externally-triggered-cron-route split, but is much
 * simpler: there is no per-row email and no de-duplication risk, so a single
 * `updateMany` per tenant is enough. This does NOT notify the client -- it is
 * purely an internal state flip, same as aprobarCotizacionAction /
 * rechazarCotizacionAction already have zero client-facing effect.
 */
export interface TenantRef {
  schemaName: string;
}

export interface CotizacionesVencidasGateway {
  marcarVencidas(schemaName: string, ahora: Date): Promise<number>;
}

export interface MarcarCotizacionesVencidasDeps {
  listarTenants(): Promise<TenantRef[]>;
  gateway: CotizacionesVencidasGateway;
  ahora: Date;
}

export interface ResumenCotizacionesVencidas {
  tenantsProcesados: number;
  cotizacionesVencidas: number;
  errores: string[];
}

/** Caps the response size: a broken shared dependency could otherwise produce
 *  one error line per tenant. */
const MAX_ERRORES_REPORTADOS = 50;

/**
 * Only the error's class name is reported, never its message. A DB error can
 * embed hosts, usernames and connection details; this summary is returned
 * over HTTP -- same convention as ejecutar-recordatorios.ts's describirError.
 */
function describirError(err: unknown): string {
  return err instanceof Error ? err.constructor.name : "Error desconocido";
}

export async function marcarCotizacionesVencidas(
  deps: MarcarCotizacionesVencidasDeps,
): Promise<ResumenCotizacionesVencidas> {
  const resumen: ResumenCotizacionesVencidas = {
    tenantsProcesados: 0,
    cotizacionesVencidas: 0,
    errores: [],
  };

  function registrarError(descripcion: string): void {
    console.error(`[cotizaciones-vencidas] ${descripcion}`);
    if (resumen.errores.length < MAX_ERRORES_REPORTADOS) {
      resumen.errores.push(descripcion);
    }
  }

  const tenants = await deps.listarTenants();

  for (const tenant of tenants) {
    try {
      const count = await deps.gateway.marcarVencidas(tenant.schemaName, deps.ahora);
      resumen.tenantsProcesados += 1;
      resumen.cotizacionesVencidas += count;
    } catch (err) {
      registrarError(`[${tenant.schemaName}] ${describirError(err)}`);
    }
  }

  return resumen;
}
