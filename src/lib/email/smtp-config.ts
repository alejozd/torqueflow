import { descifrarSecreto } from "@/lib/crypto/secret-box";

/**
 * The literal primary key of the one ConfiguracionSmtp row a tenant schema may
 * hold. The migration adds CHECK ("id" = 'singleton'), so this constant and the
 * database agree by construction and every read/write is an upsert on this id.
 */
export const CONFIGURACION_SMTP_ID = "singleton";

/** The row as it sits in the database: the password is an encrypted envelope. */
export interface ConfiguracionSmtpAlmacenada {
  host: string;
  puerto: number;
  usuario: string;
  passwordCifrado: string;
  fromEmail: string;
  fromNombre: string;
  activo: boolean;
}

/**
 * The shape the mail transport needs. Deliberately has no `passwordCifrado` and
 * no `activo`: a value of this type has already passed the "should we send at
 * all?" decision, and carrying the ciphertext alongside the plaintext would
 * invite logging both.
 */
export interface SmtpConfigDescifrada {
  host: string;
  puerto: number;
  usuario: string;
  password: string;
  fromEmail: string;
  fromNombre: string;
}

export function descifrarConfiguracionSmtp(fila: ConfiguracionSmtpAlmacenada): SmtpConfigDescifrada {
  return {
    host: fila.host,
    puerto: fila.puerto,
    usuario: fila.usuario,
    password: descifrarSecreto(fila.passwordCifrado),
    fromEmail: fila.fromEmail,
    fromNombre: fila.fromNombre,
  };
}
