import type { ConfiguracionSmtpAlmacenada, SmtpConfigDescifrada } from "@/lib/email/smtp-config";
import type { MensajeEmail } from "@/lib/email/enviar-email";
import { evaluarMantenimiento, type LecturaServicio, type MotivoMantenimiento } from "./mantenimiento";
import { construirMensajeRecordatorio } from "./plantilla";

/**
 * The reminder sweep, expressed without a single Prisma import.
 *
 * Everything the job touches arrives through `deps`, so the whole control flow
 * -- tenant enumeration, the due rule, de-duplication, partial-failure handling
 * -- is unit-testable with plain mocks and no database. gateway-prisma.ts
 * supplies the real implementation; the route only wires the two together.
 *
 * Failure policy: one bad tenant must never abort the sweep, and one bad email
 * must never abort a tenant. Every unit of work runs in its own try/catch, the
 * failure is counted and described, and the loop continues. A send that failed
 * is deliberately NOT logged to RecordatorioEnviado, so the next run retries it
 * instead of the customer silently never hearing from the shop.
 */
export interface TenantRef {
  schemaName: string;
}

export interface VehiculoParaRecordatorio {
  vehiculoId: string;
  placa: string;
  marca: string;
  modelo: string;
  clienteId: string;
  clienteNombre: string;
  clienteEmail: string | null;
  /** Delivered services, MOST RECENT FIRST, at most two. */
  servicios: LecturaServicio[];
  ultimoRecordatorioAt: Date | null;
}

export interface RegistroRecordatorio {
  vehiculoId: string;
  clienteId: string;
  emailDestino: string;
  motivo: MotivoMantenimiento;
  enviadoAt: Date;
}

export interface RecordatoriosGateway {
  obtenerConfiguracionSmtp(schemaName: string): Promise<ConfiguracionSmtpAlmacenada | null>;
  listarVehiculosParaRecordatorio(schemaName: string): Promise<VehiculoParaRecordatorio[]>;
  registrarRecordatorio(schemaName: string, registro: RegistroRecordatorio): Promise<void>;
}

export interface EjecutarRecordatoriosDeps {
  listarTenants(): Promise<TenantRef[]>;
  gateway: RecordatoriosGateway;
  descifrarConfiguracion(fila: ConfiguracionSmtpAlmacenada): SmtpConfigDescifrada;
  enviarEmail(config: SmtpConfigDescifrada, mensaje: MensajeEmail): Promise<void>;
  ahora: Date;
}

export interface ResumenRecordatorios {
  tenantsProcesados: number;
  tenantsSinSmtp: number;
  vehiculosEvaluados: number;
  enviados: number;
  omitidosPorCooldown: number;
  omitidosSinEmail: number;
  fallidos: number;
  errores: string[];
}

/** Caps the response size: a broken shared dependency could otherwise produce
 *  one error line per vehicle across every tenant. */
const MAX_ERRORES_REPORTADOS = 50;

/**
 * Only the error's class name is reported, never its message. SMTP and crypto
 * errors routinely embed hosts, usernames and -- in a badly built error string
 * -- the credential itself; this summary is returned over HTTP.
 */
function describirError(err: unknown): string {
  return err instanceof Error ? err.constructor.name : "Error desconocido";
}

export async function ejecutarRecordatorios(
  deps: EjecutarRecordatoriosDeps,
): Promise<ResumenRecordatorios> {
  const resumen: ResumenRecordatorios = {
    tenantsProcesados: 0,
    tenantsSinSmtp: 0,
    vehiculosEvaluados: 0,
    enviados: 0,
    omitidosPorCooldown: 0,
    omitidosSinEmail: 0,
    fallidos: 0,
    errores: [],
  };

  function anotarError(descripcion: string): void {
    resumen.fallidos += 1;
    if (resumen.errores.length < MAX_ERRORES_REPORTADOS) {
      resumen.errores.push(descripcion);
    }
  }

  const tenants = await deps.listarTenants();

  for (const tenant of tenants) {
    try {
      const fila = await deps.gateway.obtenerConfiguracionSmtp(tenant.schemaName);
      if (!fila || !fila.activo) {
        resumen.tenantsSinSmtp += 1;
        continue;
      }

      const smtp = deps.descifrarConfiguracion(fila);
      const vehiculos = await deps.gateway.listarVehiculosParaRecordatorio(tenant.schemaName);
      resumen.tenantsProcesados += 1;

      for (const vehiculo of vehiculos) {
        resumen.vehiculosEvaluados += 1;

        const evaluacion = evaluarMantenimiento(
          vehiculo.servicios,
          vehiculo.ultimoRecordatorioAt,
          deps.ahora,
        );
        if (!evaluacion.vencido || evaluacion.motivo === null) continue;
        if (evaluacion.bloqueadoPorCooldown) {
          resumen.omitidosPorCooldown += 1;
          continue;
        }
        if (!vehiculo.clienteEmail) {
          resumen.omitidosSinEmail += 1;
          continue;
        }

        try {
          const mensaje = construirMensajeRecordatorio(vehiculo.clienteEmail, {
            clienteNombre: vehiculo.clienteNombre,
            placa: vehiculo.placa,
            marca: vehiculo.marca,
            modelo: vehiculo.modelo,
            motivo: evaluacion.motivo,
            tallerNombre: smtp.fromNombre,
          });

          await deps.enviarEmail(smtp, mensaje);
          // Logged only after a successful send: a failed send must stay
          // retryable on the next run.
          await deps.gateway.registrarRecordatorio(tenant.schemaName, {
            vehiculoId: vehiculo.vehiculoId,
            clienteId: vehiculo.clienteId,
            emailDestino: vehiculo.clienteEmail,
            motivo: evaluacion.motivo,
            enviadoAt: deps.ahora,
          });
          resumen.enviados += 1;
        } catch (err) {
          anotarError(`[${tenant.schemaName}] ${vehiculo.placa}: ${describirError(err)}`);
        }
      }
    } catch (err) {
      anotarError(`[${tenant.schemaName}] ${describirError(err)}`);
    }
  }

  return resumen;
}
