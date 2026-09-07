"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { cifrarSecreto } from "@/lib/crypto/secret-box";
import {
  CONFIGURACION_SMTP_ID,
  descifrarConfiguracionSmtp,
  type ConfiguracionSmtpAlmacenada,
} from "@/lib/email/smtp-config";
import { enviarEmail } from "@/lib/email/enviar-email";
import { smtpConfigInputSchema } from "@/lib/validation/smtp";

export interface SmtpFormState {
  error: string | null;
  success: boolean;
}

/**
 * What the settings page is allowed to see. There is no `password` and no
 * `passwordCifrado`: the browser never receives either, not even the envelope.
 * `passwordConfigurada` is the only thing the form needs in order to render
 * "leave blank to keep the current password".
 */
export interface ConfiguracionSmtpVista {
  host: string;
  puerto: number;
  usuario: string;
  fromEmail: string;
  fromNombre: string;
  activo: boolean;
  passwordConfigurada: boolean;
  ultimaPruebaAt: Date | null;
  ultimaPruebaExitosa: boolean | null;
  ultimaPruebaDestino: string | null;
}

/** One row in the "Últimos envíos" panel -- merges three real send-tracking
 * sources (see getUltimosEnviosSmtp) into one shape the UI can render without
 * caring which table a row came from. */
export interface EnvioEmailRow {
  id: string;
  tipo: "RECORDATORIO" | "NOTIFICACION_ORDEN" | "PRUEBA";
  titulo: string;
  destinatario: string;
  ok: boolean;
  enviadoAt: Date;
}

const MAX_ENVIOS_RECIENTES = 6;

export async function getConfiguracionSmtp(): Promise<ConfiguracionSmtpVista | null> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const fila = await tenantDb.configuracionSmtp.findUnique({ where: { id: CONFIGURACION_SMTP_ID } });
  if (!fila) {
    return null;
  }

  return {
    host: fila.host,
    puerto: fila.puerto,
    usuario: fila.usuario,
    fromEmail: fila.fromEmail,
    fromNombre: fila.fromNombre,
    activo: fila.activo,
    passwordConfigurada: fila.passwordCifrado.length > 0,
    ultimaPruebaAt: fila.ultimaPruebaAt,
    ultimaPruebaExitosa: fila.ultimaPruebaExitosa,
    ultimaPruebaDestino: fila.ultimaPruebaDestino,
  };
}

/**
 * Unified, chronologically-sorted feed for the "Últimos envíos" panel.
 * Merges three real send-tracking sources -- deliberately tenant-wide, not
 * sede-scoped, matching prismaRecordatoriosGateway's established convention
 * (there is no "sede activa" without a signed-in user, and these reads are
 * for an ADMIN reviewing the whole tenant's mail activity):
 *   - RecordatorioEnviado: one row per successfully-sent maintenance
 *     reminder (no failure state -- every row here is a success).
 *   - NotificacionOrdenEnviada: one row per order-status-notification
 *     attempt, success or failure.
 *   - The persisted "Enviar correo de prueba" result, if any.
 */
export async function getUltimosEnviosSmtp(): Promise<EnvioEmailRow[]> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const [recordatorios, notificaciones, configuracion] = await Promise.all([
    tenantDb.recordatorioEnviado.findMany({
      orderBy: { enviadoAt: "desc" },
      take: MAX_ENVIOS_RECIENTES,
      select: { emailDestino: true, enviadoAt: true, vehiculo: { select: { placa: true } } },
    }),
    tenantDb.notificacionOrdenEnviada.findMany({
      orderBy: { enviadoAt: "desc" },
      take: MAX_ENVIOS_RECIENTES,
      select: {
        emailDestino: true,
        enviadoAt: true,
        resultado: true,
        estado: true,
        orden: { select: { vehiculo: { select: { placa: true } } } },
      },
    }),
    tenantDb.configuracionSmtp.findUnique({ where: { id: CONFIGURACION_SMTP_ID } }),
  ]);

  const filas: EnvioEmailRow[] = [
    ...recordatorios.map((r, i) => ({
      id: `recordatorio-${i}`,
      tipo: "RECORDATORIO" as const,
      titulo: `Recordatorio de mantenimiento · ${r.vehiculo.placa}`,
      destinatario: r.emailDestino,
      ok: true,
      enviadoAt: r.enviadoAt,
    })),
    ...notificaciones.map((n, i) => ({
      id: `notificacion-${i}`,
      tipo: "NOTIFICACION_ORDEN" as const,
      titulo: `Notificación de orden (${n.estado}) · ${n.orden.vehiculo.placa}`,
      destinatario: n.emailDestino,
      ok: n.resultado === "ENVIADA",
      enviadoAt: n.enviadoAt,
    })),
  ];

  if (configuracion?.ultimaPruebaAt) {
    filas.push({
      id: "prueba",
      tipo: "PRUEBA",
      titulo: "Correo de prueba",
      destinatario: configuracion.ultimaPruebaDestino ?? "",
      ok: configuracion.ultimaPruebaExitosa === true,
      enviadoAt: configuracion.ultimaPruebaAt,
    });
  }

  filas.sort((a, b) => b.enviadoAt.getTime() - a.enviadoAt.getTime());
  return filas.slice(0, MAX_ENVIOS_RECIENTES);
}

export async function guardarConfiguracionSmtpAction(
  prevState: SmtpFormState,
  formData: FormData,
): Promise<SmtpFormState> {
  const session = await requireRole(["ADMIN"]);

  const parsed = smtpConfigInputSchema.safeParse({
    host: formData.get("host") ?? "",
    puerto: formData.get("puerto") ?? "",
    usuario: formData.get("usuario") ?? "",
    password: formData.get("password") ?? "",
    fromEmail: formData.get("fromEmail") ?? "",
    fromNombre: formData.get("fromNombre") ?? "",
    activo: formData.get("activo") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const tenantDb = getTenantDb(session.user.tenantSchema);
  const existente = await tenantDb.configuracionSmtp.findUnique({
    where: { id: CONFIGURACION_SMTP_ID },
  });

  // A blank password field means "keep what is stored" -- the form cannot show
  // the current password, so requiring a re-type on every host/port edit would
  // push admins to keep it in a text file somewhere.
  const passwordNueva = parsed.data.password ?? "";
  if (!passwordNueva && !existente) {
    return {
      error: "La contraseña es obligatoria la primera vez que configuras el SMTP.",
      success: false,
    };
  }
  const passwordCifrado = passwordNueva ? cifrarSecreto(passwordNueva) : existente!.passwordCifrado;

  const campos = {
    host: parsed.data.host,
    puerto: parsed.data.puerto,
    usuario: parsed.data.usuario,
    passwordCifrado,
    fromEmail: parsed.data.fromEmail,
    fromNombre: parsed.data.fromNombre,
    activo: parsed.data.activo,
  };

  try {
    await tenantDb.configuracionSmtp.upsert({
      where: { id: CONFIGURACION_SMTP_ID },
      create: { id: CONFIGURACION_SMTP_ID, ...campos },
      update: campos,
    });
  } catch (err) {
    return {
      error: friendlyPrismaErrorMessage(err, "Error al guardar la configuración SMTP"),
      success: false,
    };
  }

  revalidatePath("/configuracion-smtp");
  return { error: null, success: true };
}

/**
 * Sends one test message to the signed-in ADMIN's own address. The destination
 * deliberately comes from the session, not from the form: a settings page that
 * mails an arbitrary attacker-supplied address through the tenant's own server
 * is an open relay with extra steps.
 */
export async function probarConfiguracionSmtpAction(
  prevState: SmtpFormState,
  formData: FormData,
): Promise<SmtpFormState> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const fila = await tenantDb.configuracionSmtp.findUnique({ where: { id: CONFIGURACION_SMTP_ID } });
  if (!fila) {
    return {
      error: "Configura y guarda el servidor SMTP antes de enviar una prueba.",
      success: false,
    };
  }

  const destino = session.user.email;
  if (!destino) {
    return { error: "Tu usuario no tiene un correo donde recibir la prueba.", success: false };
  }

  try {
    const config = descifrarConfiguracionSmtp(fila as ConfiguracionSmtpAlmacenada);
    await enviarEmail(config, {
      para: destino,
      asunto: "TorqueFlow — prueba de configuración SMTP",
      texto:
        "Este es un correo de prueba enviado desde TorqueFlow.\n\n" +
        "Si lo recibiste, la configuración SMTP de tu taller funciona y los " +
        "recordatorios de mantenimiento podrán enviarse.",
      html:
        "<p>Este es un correo de prueba enviado desde <strong>TorqueFlow</strong>.</p>" +
        "<p>Si lo recibiste, la configuración SMTP de tu taller funciona y los " +
        "recordatorios de mantenimiento podrán enviarse.</p>",
    });
  } catch {
    // The raw SMTP/crypto error can carry the host, the user and internal IPs.
    // It is logged nowhere and shown as one generic message.
    await tenantDb.configuracionSmtp.update({
      where: { id: CONFIGURACION_SMTP_ID },
      data: { ultimaPruebaAt: new Date(), ultimaPruebaExitosa: false, ultimaPruebaDestino: destino },
    });
    revalidatePath("/configuracion-smtp");
    return {
      error: "No se pudo enviar el correo de prueba. Revisa el servidor, el puerto y las credenciales.",
      success: false,
    };
  }

  await tenantDb.configuracionSmtp.update({
    where: { id: CONFIGURACION_SMTP_ID },
    data: { ultimaPruebaAt: new Date(), ultimaPruebaExitosa: true, ultimaPruebaDestino: destino },
  });
  revalidatePath("/configuracion-smtp");
  return { error: null, success: true };
}
