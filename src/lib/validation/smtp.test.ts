import { describe, expect, it } from "vitest";
import { smtpConfigInputSchema } from "./smtp";

const valido = {
  host: "smtp.taller.test",
  puerto: "587",
  usuario: "avisos@taller.test",
  password: "clave-del-taller",
  fromEmail: "avisos@taller.test",
  fromNombre: "Taller Pérez",
  activo: "on",
};

describe("smtpConfigInputSchema", () => {
  it("accepts a full form submission and coerces puerto to a number", () => {
    const resultado = smtpConfigInputSchema.safeParse(valido);

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.puerto).toBe(587);
      expect(resultado.data.activo).toBe(true);
    }
  });

  it("treats an absent checkbox value as activo=false", () => {
    const resultado = smtpConfigInputSchema.safeParse({ ...valido, activo: "" });

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.activo).toBe(false);
    }
  });

  it("accepts an empty password, which the action reads as 'keep the stored one'", () => {
    const resultado = smtpConfigInputSchema.safeParse({ ...valido, password: "" });

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.password).toBe("");
    }
  });

  it("rejects an empty host", () => {
    const resultado = smtpConfigInputSchema.safeParse({ ...valido, host: "" });
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe("El servidor SMTP es obligatorio");
    }
  });

  it("rejects a puerto outside 1-65535", () => {
    expect(smtpConfigInputSchema.safeParse({ ...valido, puerto: "0" }).success).toBe(false);
    expect(smtpConfigInputSchema.safeParse({ ...valido, puerto: "70000" }).success).toBe(false);
    expect(smtpConfigInputSchema.safeParse({ ...valido, puerto: "no-numero" }).success).toBe(false);
  });

  it("rejects a fromEmail that is not an email address", () => {
    const resultado = smtpConfigInputSchema.safeParse({ ...valido, fromEmail: "no-es-email" });
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe("El correo remitente no es válido");
    }
  });

  it("rejects an empty usuario and an empty fromNombre", () => {
    expect(smtpConfigInputSchema.safeParse({ ...valido, usuario: "" }).success).toBe(false);
    expect(smtpConfigInputSchema.safeParse({ ...valido, fromNombre: "" }).success).toBe(false);
  });
});
