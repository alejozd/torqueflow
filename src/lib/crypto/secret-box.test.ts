import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cifrarSecreto, descifrarSecreto, obtenerClaveMaestra } from "./secret-box";

const CLAVE_VALIDA = "0".repeat(63) + "1";
const OTRA_CLAVE = "f".repeat(64);
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

describe("obtenerClaveMaestra", () => {
  it("rejects a missing SMTP_ENCRYPTION_KEY instead of defaulting to anything", () => {
    delete process.env.SMTP_ENCRYPTION_KEY;
    expect(() => obtenerClaveMaestra()).toThrow(/SMTP_ENCRYPTION_KEY/);
  });

  it("rejects a key that is not 64 hex characters", () => {
    process.env.SMTP_ENCRYPTION_KEY = "demasiado-corta";
    expect(() => obtenerClaveMaestra()).toThrow(/64 caracteres hexadecimales/);
  });

  it("returns 32 bytes for a valid key", () => {
    expect(obtenerClaveMaestra()).toHaveLength(32);
  });
});

describe("cifrarSecreto / descifrarSecreto", () => {
  it("round-trips a password unchanged", () => {
    const sobre = cifrarSecreto("sup3r-s3cr3t@!");
    expect(descifrarSecreto(sobre)).toBe("sup3r-s3cr3t@!");
  });

  it("round-trips non-ASCII characters unchanged", () => {
    const sobre = cifrarSecreto("contraseña-ñandú-€");
    expect(descifrarSecreto(sobre)).toBe("contraseña-ñandú-€");
  });

  it("never emits the plaintext in the envelope", () => {
    const sobre = cifrarSecreto("sup3r-s3cr3t@!");
    expect(sobre).not.toContain("sup3r-s3cr3t@!");
  });

  it("produces a different envelope every call (random IV), both decrypting correctly", () => {
    const a = cifrarSecreto("misma-clave");
    const b = cifrarSecreto("misma-clave");
    expect(a).not.toBe(b);
    expect(descifrarSecreto(a)).toBe("misma-clave");
    expect(descifrarSecreto(b)).toBe("misma-clave");
  });

  it("uses a versioned four-part envelope", () => {
    const partes = cifrarSecreto("x").split(":");
    expect(partes).toHaveLength(4);
    expect(partes[0]).toBe("v1");
  });

  it("refuses an envelope that was tampered with (GCM auth tag)", () => {
    const partes = cifrarSecreto("sup3r-s3cr3t@!").split(":");
    const cifradoAlterado = Buffer.from(partes[3], "base64");
    cifradoAlterado[0] = cifradoAlterado[0] ^ 0xff;
    const sobreAlterado = [partes[0], partes[1], partes[2], cifradoAlterado.toString("base64")].join(":");

    expect(() => descifrarSecreto(sobreAlterado)).toThrow();
  });

  it("refuses an envelope encrypted under a different master key", () => {
    const sobre = cifrarSecreto("sup3r-s3cr3t@!");
    process.env.SMTP_ENCRYPTION_KEY = OTRA_CLAVE;

    expect(() => descifrarSecreto(sobre)).toThrow();
  });

  it("refuses a malformed envelope", () => {
    expect(() => descifrarSecreto("no-es-un-sobre")).toThrow(/Formato de secreto cifrado inválido/);
    expect(() => descifrarSecreto("v2:a:b:c")).toThrow(/Formato de secreto cifrado inválido/);
  });
});
