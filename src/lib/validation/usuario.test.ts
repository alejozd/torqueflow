import { describe, expect, it } from "vitest";
import { usuarioCreateInputSchema, usuarioUpdateInputSchema } from "./usuario";

describe("usuarioCreateInputSchema", () => {
  it("accepts a valid payload", () => {
    const result = usuarioCreateInputSchema.safeParse({
      nombre: "Ana Pérez",
      email: "ana@taller.test",
      password: "contraseña-larga",
      role: "TECNICO",
      activo: "true",
      sedeIds: ["sede-1"],
      sedeDefectoId: "",
    });
    expect(result.success).toBe(true);
  });

  it("requires a password of at least 8 characters", () => {
    const result = usuarioCreateInputSchema.safeParse({
      nombre: "Ana Pérez",
      email: "ana@taller.test",
      password: "corta",
      role: "TECNICO",
      activo: "true",
      sedeIds: ["sede-1"],
      sedeDefectoId: "",
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
      activo: "true",
      sedeIds: ["sede-1"],
      sedeDefectoId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a role outside the fixed set", () => {
    const result = usuarioCreateInputSchema.safeParse({
      nombre: "Ana Pérez",
      email: "ana@taller.test",
      password: "contraseña-larga",
      role: "SUPERUSUARIO",
      activo: "true",
      sedeIds: ["sede-1"],
      sedeDefectoId: "",
    });
    expect(result.success).toBe(false);
  });

  it("transforms activo 'true'/'false' into a boolean", () => {
    const activo = usuarioCreateInputSchema.safeParse({
      nombre: "Ana Pérez",
      email: "ana@taller.test",
      password: "contraseña-larga",
      role: "TECNICO",
      activo: "false",
      sedeIds: ["sede-1"],
      sedeDefectoId: "",
    });
    expect(activo.success).toBe(true);
    expect(activo.success ? activo.data.activo : null).toBe(false);
  });

  it("requires at least one sedeId for a non-ADMIN role", () => {
    const result = usuarioCreateInputSchema.safeParse({
      nombre: "Ana Pérez",
      email: "ana@taller.test",
      password: "contraseña-larga",
      role: "TECNICO",
      activo: "true",
      sedeIds: [],
      sedeDefectoId: "",
    });
    expect(result.success).toBe(false);
    expect(result.success ? null : result.error.issues[0]?.message).toBe("Selecciona al menos una sede");
  });

  it("allows an empty sedeIds for ADMIN (ADMIN bypasses assignment)", () => {
    const result = usuarioCreateInputSchema.safeParse({
      nombre: "Ana Pérez",
      email: "ana@taller.test",
      password: "contraseña-larga",
      role: "ADMIN",
      activo: "true",
      sedeIds: [],
      sedeDefectoId: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a sedeDefectoId that is not among the selected sedeIds for a non-ADMIN", () => {
    const result = usuarioCreateInputSchema.safeParse({
      nombre: "Ana Pérez",
      email: "ana@taller.test",
      password: "contraseña-larga",
      role: "TECNICO",
      activo: "true",
      sedeIds: ["sede-1"],
      sedeDefectoId: "sede-2",
    });
    expect(result.success).toBe(false);
    expect(result.success ? null : result.error.issues[0]?.message).toBe(
      "La sede por defecto debe ser una de las sedes asignadas",
    );
  });

  it("accepts a sedeDefectoId that IS among the selected sedeIds for a non-ADMIN", () => {
    const result = usuarioCreateInputSchema.safeParse({
      nombre: "Ana Pérez",
      email: "ana@taller.test",
      password: "contraseña-larga",
      role: "TECNICO",
      activo: "true",
      sedeIds: ["sede-1", "sede-2"],
      sedeDefectoId: "sede-2",
    });
    expect(result.success).toBe(true);
  });

  it("accepts any valid sedeDefectoId for ADMIN regardless of sedeIds", () => {
    const result = usuarioCreateInputSchema.safeParse({
      nombre: "Ana Pérez",
      email: "ana@taller.test",
      password: "contraseña-larga",
      role: "ADMIN",
      activo: "true",
      sedeIds: [],
      sedeDefectoId: "sede-9",
    });
    expect(result.success).toBe(true);
  });
});

describe("usuarioUpdateInputSchema", () => {
  it("accepts an empty password (keep the existing one)", () => {
    const result = usuarioUpdateInputSchema.safeParse({
      nombre: "Ana Pérez",
      email: "ana@taller.test",
      password: "",
      role: "TECNICO",
      activo: "true",
      sedeIds: ["sede-1"],
      sedeDefectoId: "",
    });
    expect(result.success).toBe(true);
  });

  it("still enforces the 8-character minimum when a new password IS submitted", () => {
    const result = usuarioUpdateInputSchema.safeParse({
      nombre: "Ana Pérez",
      email: "ana@taller.test",
      password: "corta",
      role: "TECNICO",
      activo: "true",
      sedeIds: ["sede-1"],
      sedeDefectoId: "",
    });
    expect(result.success).toBe(false);
  });

  it("requires at least one sedeId for a non-ADMIN role", () => {
    const result = usuarioUpdateInputSchema.safeParse({
      nombre: "Ana Pérez",
      email: "ana@taller.test",
      password: "",
      role: "RECEPCION",
      activo: "true",
      sedeIds: [],
      sedeDefectoId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a sedeDefectoId outside the selected sedeIds for a non-ADMIN", () => {
    const result = usuarioUpdateInputSchema.safeParse({
      nombre: "Ana Pérez",
      email: "ana@taller.test",
      password: "",
      role: "RECEPCION",
      activo: "true",
      sedeIds: ["sede-1"],
      sedeDefectoId: "sede-2",
    });
    expect(result.success).toBe(false);
  });
});
