import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cifrarSecreto } from "@/lib/crypto/secret-box";
import {
  CONFIGURACION_SMTP_ID,
  descifrarConfiguracionSmtp,
  type ConfiguracionSmtpAlmacenada,
} from "./smtp-config";

const CLAVE_VALIDA = "0".repeat(63) + "1";
const claveOriginal = process.env.SMTP_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.SMTP_ENCRYPTION_KEY = CLAVE_VALIDA;
});

afterEach(() => {
  if (claveOriginal === undefined) {
    delete process.env.SMTP_ENCRYPTION_KEY;
  } else {
    process.env.SMTP_ENCRYPTION_KEY = claveOriginal;
  }
});

function filaDePrueba(passwordPlano: string): ConfiguracionSmtpAlmacenada {
  return {
    host: "smtp.taller.test",
    puerto: 587,
    usuario: "avisos@taller.test",
    passwordCifrado: cifrarSecreto(passwordPlano),
    fromEmail: "avisos@taller.test",
    fromNombre: "Taller Pérez",
    activo: true,
  };
}

describe("CONFIGURACION_SMTP_ID", () => {
  it("is the literal singleton id the migration's CHECK constraint enforces", () => {
    expect(CONFIGURACION_SMTP_ID).toBe("singleton");
  });
});

describe("descifrarConfiguracionSmtp", () => {
  it("returns the row's fields with the password decrypted and the ciphertext dropped", () => {
    const resultado = descifrarConfiguracionSmtp(filaDePrueba("clave-del-taller"));

    expect(resultado).toEqual({
      host: "smtp.taller.test",
      puerto: 587,
      usuario: "avisos@taller.test",
      password: "clave-del-taller",
      fromEmail: "avisos@taller.test",
      fromNombre: "Taller Pérez",
    });
    expect(resultado).not.toHaveProperty("passwordCifrado");
    expect(resultado).not.toHaveProperty("activo");
  });

  it("propagates the decrypt failure instead of returning an empty password", () => {
    const fila = { ...filaDePrueba("clave"), passwordCifrado: "v1:a:b:c" };

    expect(() => descifrarConfiguracionSmtp(fila)).toThrow();
  });
});
