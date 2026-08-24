import { describe, expect, it } from "vitest";
import { usuarioCreateInputSchema, usuarioUpdateInputSchema } from "./usuario";

describe("usuarioCreateInputSchema", () => {
  it("accepts a valid payload", () => {
    const result = usuarioCreateInputSchema.safeParse({
      nombre: "Ana Pérez",
      email: "ana@taller.test",
      password: "contraseña-larga",
      role: "TECNICO",
    });
    expect(result.success).toBe(true);
  });

  it("requires a password of at least 8 characters", () => {
    const result = usuarioCreateInputSchema.safeParse({
      nombre: "Ana Pérez",
      email: "ana@taller.test",
      password: "corta",
      role: "TECNICO",
    });
    expect(result.success).toBe(false);
    expect(result.success ? null : result.error.issues[0]?.message).toBe(
      "La contraseña debe tener al menos 8 caracteres",
    );
  });

  it("rejects an invalid email", () => {
    const result = usuarioCreateInputSchema.safeParse({
      nombre: "Ana Pérez",
      email: "no-es-un-correo",
      password: "contraseña-larga",
      role: "TECNICO",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a role outside the fixed set", () => {
    const result = usuarioCreateInputSchema.safeParse({
      nombre: "Ana Pérez",
      email: "ana@taller.test",
      password: "contraseña-larga",
      role: "SUPERUSUARIO",
    });
    expect(result.success).toBe(false);
  });
});

describe("usuarioUpdateInputSchema", () => {
  it("accepts an empty password (keep the existing one)", () => {
    const result = usuarioUpdateInputSchema.safeParse({
      nombre: "Ana Pérez",
      email: "ana@taller.test",
      password: "",
      role: "TECNICO",
    });
    expect(result.success).toBe(true);
  });

  it("still enforces the 8-character minimum when a new password IS submitted", () => {
    const result = usuarioUpdateInputSchema.safeParse({
      nombre: "Ana Pérez",
      email: "ana@taller.test",
      password: "corta",
      role: "TECNICO",
    });
    expect(result.success).toBe(false);
  });
});
