import type { ConfiguracionSmtpAlmacenada, SmtpConfigDescifrada } from "@/lib/email/smtp-config";
import type { MensajeEmail } from "@/lib/email/enviar-email";
import { describirError, type TenantRef } from "@/lib/recordatorios/ejecutar-recordatorios";
import {
  diasHastaVencimiento,
  estadoVencimiento,
  fechaInicioVencidosEmail,
  fechaLimiteAviso,
  requiereAviso,
  VENTANA_VENCIDOS_EMAIL_DIAS,
  type TipoDocumento,
} from "./estado-vencimiento";
import { construirMensajeAvisoVencimiento } from "./plantilla";

/**
 * Barrido de avisos de vencimiento (SOAT / RTM) por email. Mismo diseño y
 * misma política de fallos que ejecutar-recordatorios.ts: sin Prisma, todo
 * llega por `deps`; un tenant o un email fallido nunca aborta el resto; un
 * envío fallido NO se registra (se reintenta en la próxima corrida).
 */
export interface DocumentoParaAviso {
  vehiculoId: string;
  placa: string;
  clienteNombre: string;
  clienteEmail: string | null;
  tipo: TipoDocumento;
  fechaVencimiento: Date;
  yaAvisadoPorEmail: boolean;
}

export interface RegistroAviso {
  vehiculoId: string;
  tipo: TipoDocumento;
  fechaVencimiento: Date;
  canal: "EMAIL" | "WHATSAPP";
  destino: string;
  enviadoPorId: string | null;
  enviadoAt: Date;
}

export interface AvisosGateway {
  obtenerConfiguracionSmtp(schemaName: string): Promise<ConfiguracionSmtpAlmacenada | null>;
  obtenerDiasAviso(schemaName: string): Promise<number>;
  listarDocumentosParaAviso(schemaName: string, desde: Date, hasta: Date): Promise<DocumentoParaAviso[]>;
  registrarAviso(schemaName: string, registro: RegistroAviso): Promise<void>;
}

export interface EjecutarAvisosDeps {
  listarTenants(): Promise<TenantRef[]>;
  gateway: AvisosGateway;
  descifrarConfiguracion(fila: ConfiguracionSmtpAlmacenada): SmtpConfigDescifrada;
  enviarEmail(config: SmtpConfigDescifrada, mensaje: MensajeEmail): Promise<void>;
  ahora: Date;
}

export interface ResumenAvisos {
  tenantsProcesados: number;
  tenantsSinSmtp: number;
  documentosEvaluados: number;
  enviados: number;
  enviadosNoRegistrados: number;
  omitidosYaAvisados: number;
  omitidosSinEmail: number;
  fallidos: number;
  errores: string[];
}

const MAX_ERRORES_REPORTADOS = 50;

export async function ejecutarAvisosVencimiento(deps: EjecutarAvisosDeps): Promise<ResumenAvisos> {
  const resumen: ResumenAvisos = {
    tenantsProcesados: 0,
    tenantsSinSmtp: 0,
    documentosEvaluados: 0,
    enviados: 0,
    enviadosNoRegistrados: 0,
    omitidosYaAvisados: 0,
    omitidosSinEmail: 0,
    fallidos: 0,
    errores: [],
  };

  function registrarError(descripcion: string): void {
    console.error(`[avisos-vencimiento] ${descripcion}`);
    if (resumen.errores.length < MAX_ERRORES_REPORTADOS) resumen.errores.push(descripcion);
  }

  function anotarError(descripcion: string): void {
    resumen.fallidos += 1;
    registrarError(descripcion);
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
      const diasAviso = await deps.gateway.obtenerDiasAviso(tenant.schemaName);
      const documentos = await deps.gateway.listarDocumentosParaAviso(
        tenant.schemaName,
        fechaInicioVencidosEmail(deps.ahora),
        fechaLimiteAviso(deps.ahora, diasAviso),
      );
      resumen.tenantsProcesados += 1;

      for (const doc of documentos) {
        resumen.documentosEvaluados += 1;

        // The gateway pre-filters by date range; the real rule still decides here.
        const estado = estadoVencimiento(doc.fechaVencimiento, deps.ahora, diasAviso);
        if (!requiereAviso(estado)) continue;
        if (diasHastaVencimiento(doc.fechaVencimiento, deps.ahora) < -VENTANA_VENCIDOS_EMAIL_DIAS) continue;
        if (doc.yaAvisadoPorEmail) {
          resumen.omitidosYaAvisados += 1;
          continue;
        }
        if (!doc.clienteEmail) {
          resumen.omitidosSinEmail += 1;
          continue;
        }

        let mensajeEnviado = false;
        try {
          const mensaje = construirMensajeAvisoVencimiento(doc.clienteEmail, {
            clienteNombre: doc.clienteNombre,
            placa: doc.placa,
            tipo: doc.tipo,
            fechaVencimiento: doc.fechaVencimiento,
            tallerNombre: smtp.fromNombre,
            ahora: deps.ahora,
          });
          await deps.enviarEmail(smtp, mensaje);
          mensajeEnviado = true;

          const registro: RegistroAviso = {
            vehiculoId: doc.vehiculoId,
            tipo: doc.tipo,
            fechaVencimiento: doc.fechaVencimiento,
            canal: "EMAIL",
            destino: doc.clienteEmail,
            enviadoPorId: null,
            enviadoAt: deps.ahora,
          };
          // Same bounded retry as the maintenance sweep: one immediate retry,
          // then the distinguishable "sent but not recorded" case below.
          try {
            await deps.gateway.registrarAviso(tenant.schemaName, registro);
          } catch {
            await deps.gateway.registrarAviso(tenant.schemaName, registro);
          }
          resumen.enviados += 1;
        } catch (err) {
          if (mensajeEnviado) {
            resumen.enviados += 1;
            resumen.enviadosNoRegistrados += 1;
            registrarError(
              `[${tenant.schemaName}] ${doc.placa} ${doc.tipo}: RIESGO_DUPLICADO — enviado pero no registrado (${describirError(err)})`,
            );
          } else {
            anotarError(`[${tenant.schemaName}] ${doc.placa} ${doc.tipo}: ${describirError(err)}`);
          }
        }
      }
    } catch (err) {
      anotarError(`[${tenant.schemaName}] ${describirError(err)}`);
    }
  }

  return resumen;
}
