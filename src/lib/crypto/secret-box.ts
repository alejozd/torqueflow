import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Symmetric encryption for the one secret this app stores at rest: each
 * tenant's SMTP password. AES-256-GCM is authenticated encryption, so a
 * tampered ciphertext fails loudly at decrypt time instead of yielding
 * garbage that would then be handed to an SMTP server.
 *
 * The envelope is "v1:<iv>:<authTag>:<ciphertext>", all base64. Base64's
 * alphabet never contains ":", so splitting on ":" is unambiguous. The "v1"
 * prefix exists so a future algorithm change can be detected rather than
 * silently mis-decrypted.
 *
 * The master key lives in SMTP_ENCRYPTION_KEY (.env), never in the database:
 * that is the whole point -- a database dump alone must not yield working SMTP
 * credentials. Rotating the key invalidates every stored password; each tenant
 * must then re-enter it from /configuracion-smtp.
 */
const ALGORITMO = "aes-256-gcm";
const LONGITUD_IV = 12;
const VERSION = "v1";
const LONGITUD_CLAVE_HEX = 64;

export function obtenerClaveMaestra(): Buffer {
  const hex = process.env.SMTP_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error("SMTP_ENCRYPTION_KEY no está configurada");
  }
  if (hex.length !== LONGITUD_CLAVE_HEX || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error("SMTP_ENCRYPTION_KEY debe ser 64 caracteres hexadecimales (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

export function cifrarSecreto(textoPlano: string): string {
  const clave = obtenerClaveMaestra();
  const iv = randomBytes(LONGITUD_IV);
  const cipher = createCipheriv(ALGORITMO, clave, iv);
  const cifrado = Buffer.concat([cipher.update(textoPlano, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv.toString("base64"), tag.toString("base64"), cifrado.toString("base64")].join(":");
}

export function descifrarSecreto(sobre: string): string {
  const clave = obtenerClaveMaestra();
  const partes = sobre.split(":");
  if (partes.length !== 4 || partes[0] !== VERSION) {
    throw new Error("Formato de secreto cifrado inválido");
  }

  const iv = Buffer.from(partes[1], "base64");
  const tag = Buffer.from(partes[2], "base64");
  const cifrado = Buffer.from(partes[3], "base64");

  const decipher = createDecipheriv(ALGORITMO, clave, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(cifrado), decipher.final()]).toString("utf8");
}
