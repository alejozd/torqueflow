import nodemailer from "nodemailer";
import type { SmtpConfigDescifrada } from "./smtp-config";

/**
 * The only Nodemailer-aware module in the codebase. Everything upstream deals
 * in MensajeEmail values, so the reminder job, the SMTP test button and any
 * future Fase 8 notification all send through this one function.
 *
 * A transport is created per call rather than cached: each tenant has its own
 * SMTP server and credentials, and reminder runs are infrequent, so a pooled
 * connection would buy nothing and would keep decrypted passwords alive in
 * memory between runs.
 */
export interface MensajeEmail {
  para: string;
  asunto: string;
  texto: string;
  html: string;
}

export async function enviarEmail(config: SmtpConfigDescifrada, mensaje: MensajeEmail): Promise<void> {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.puerto,
    // 465 is implicit TLS ("SMTPS"); 587 and 25 start plaintext and upgrade via
    // STARTTLS, which nodemailer negotiates automatically when secure is false.
    secure: config.puerto === 465,
    auth: { user: config.usuario, pass: config.password },
  });

  await transport.sendMail({
    from: `"${config.fromNombre}" <${config.fromEmail}>`,
    to: mensaje.para,
    subject: mensaje.asunto,
    text: mensaje.texto,
    html: mensaje.html,
  });
}
