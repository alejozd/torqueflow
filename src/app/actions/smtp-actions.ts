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
}

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
  };
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
    return {
      error: "No se pudo enviar el correo de prueba. Revisa el servidor, el puerto y las credenciales.",
      success: false,
    };
  }

  return { error: null, success: true };
}
