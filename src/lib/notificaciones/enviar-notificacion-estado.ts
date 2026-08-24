import type { SmtpConfigDescifrada } from "@/lib/email/smtp-config";
import type { MensajeEmail } from "@/lib/email/enviar-email";
import type { EstadoOrden } from "@/generated/prisma-tenant";
import { construirMensajeEstadoOrden, esEstadoNotificable } from "./plantilla";

/**
 * DB-free, exactly like Fase 7's ejecutarRecordatorios: every Prisma call
 * (reading ConfiguracionSmtp, writing NotificacionOrdenEnviada) stays in
 * orden-actions.ts, the only Prisma-aware module this phase touches. Unit
 * testable with plain mocks and no database.
 */
export type ResultadoNotificacion =
  | "ENVIADA"
  | "SIN_SMTP_ACTIVO"
  | "SIN_EMAIL_CLIENTE"
  | "FALLO_ENVIO"
  | "ESTADO_NO_NOTIFICABLE";

export interface DatosNotificacionOrden {
  clienteNombre: string;
  clienteEmail: string | null;
  placa: string;
  marca: string;
  modelo: string;
  estado: EstadoOrden;
}

export interface EnviarNotificacionEstadoDeps {
  /** Already decrypted; null means "not configured or not activo". */
  smtp: SmtpConfigDescifrada | null;
  enviarEmail(config: SmtpConfigDescifrada, mensaje: MensajeEmail): Promise<void>;
}

export async function enviarNotificacionEstadoOrden(
  deps: EnviarNotificacionEstadoDeps,
  datos: DatosNotificacionOrden,
): Promise<ResultadoNotificacion> {
  if (!esEstadoNotificable(datos.estado)) {
    return "ESTADO_NO_NOTIFICABLE";
  }
  if (!deps.smtp) {
    return "SIN_SMTP_ACTIVO";
  }
  if (!datos.clienteEmail) {
    return "SIN_EMAIL_CLIENTE";
  }

  const mensaje = construirMensajeEstadoOrden(datos.clienteEmail, {
    clienteNombre: datos.clienteNombre,
    placa: datos.placa,
    marca: datos.marca,
    modelo: datos.modelo,
    estado: datos.estado,
    tallerNombre: deps.smtp.fromNombre,
  });

  try {
    await deps.enviarEmail(deps.smtp, mensaje);
  } catch {
    return "FALLO_ENVIO";
  }

  return "ENVIADA";
}
