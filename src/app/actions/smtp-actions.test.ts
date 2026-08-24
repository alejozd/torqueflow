import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: vi.fn(),
}));

const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    configuracionSmtp: { findUnique: mockFindUnique, upsert: mockUpsert },
  }),
}));

const mockEnviarEmail = vi.fn();
vi.mock("@/lib/email/enviar-email", () => ({
  enviarEmail: (...args: unknown[]) => mockEnviarEmail(...args),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { cifrarSecreto } from "@/lib/crypto/secret-box";
import {
  getConfiguracionSmtp,
  guardarConfiguracionSmtpAction,
  probarConfiguracionSmtpAction,
  type SmtpFormState,
} from "./smtp-actions";

const CLAVE_VALIDA = "0".repeat(63) + "1";
const claveOriginal = process.env.SMTP_ENCRYPTION_KEY;
const initialState: SmtpFormState = { error: null, success: false };
const ADMIN = {
  user: {
    id: "u-adm",
    email: "admin@taller.test",
    role: "ADMIN",
    tenantSchema: "taller_perez",
    sedeActivaId: "sede-1",
  },
};

function formularioValido(): FormData {
  const formData = new FormData();
  formData.set("host", "smtp.taller.test");
  formData.set("puerto", "587");
  formData.set("usuario", "avisos@taller.test");
  formData.set("password", "clave-del-taller");
  formData.set("fromEmail", "avisos@taller.test");
  formData.set("fromNombre", "Taller Pérez");
  formData.set("activo", "on");
  return formData;
}

function filaAlmacenada(passwordPlano = "clave-guardada") {
  return {
    id: "singleton",
    host: "smtp.viejo.test",
    puerto: 465,
    usuario: "viejo@taller.test",
    passwordCifrado: cifrarSecreto(passwordPlano),
    fromEmail: "viejo@taller.test",
    fromNombre: "Taller Viejo",
    activo: true,
  };
}

beforeEach(() => {
  process.env.SMTP_ENCRYPTION_KEY = CLAVE_VALIDA;
  mockRequireRole.mockReset().mockResolvedValue(ADMIN);
  mockFindUnique.mockReset().mockResolvedValue(null);
  mockUpsert.mockReset().mockResolvedValue({ id: "singleton" });
  mockEnviarEmail.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  if (claveOriginal === undefined) {
    delete process.env.SMTP_ENCRYPTION_KEY;
  } else {
    process.env.SMTP_ENCRYPTION_KEY = claveOriginal;
  }
});

describe("getConfiguracionSmtp", () => {
  it("is ADMIN-only", async () => {
    await getConfiguracionSmtp();

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
  });

  it("returns null when the tenant has never configured SMTP", async () => {
    expect(await getConfiguracionSmtp()).toBeNull();
  });

  it("never returns the password or its ciphertext, only whether one is stored", async () => {
    mockFindUnique.mockResolvedValue(filaAlmacenada());

    const vista = await getConfiguracionSmtp();

    expect(vista).toEqual({
      host: "smtp.viejo.test",
      puerto: 465,
      usuario: "viejo@taller.test",
      fromEmail: "viejo@taller.test",
      fromNombre: "Taller Viejo",
      activo: true,
      passwordConfigurada: true,
    });
    expect(JSON.stringify(vista)).not.toContain("clave-guardada");
    expect(JSON.stringify(vista)).not.toContain("v1:");
  });

  it("reads the singleton row by its literal id", async () => {
    await getConfiguracionSmtp();

    expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: "singleton" } });
  });
});

describe("guardarConfiguracionSmtpAction", () => {
  it("is ADMIN-only and calls the guard before validating", async () => {
    mockRequireRole.mockRejectedValue(new Error("REDIRECT:/login?error=forbidden"));

    await expect(guardarConfiguracionSmtpAction(initialState, new FormData())).rejects.toThrow(
      "REDIRECT:/login?error=forbidden",
    );
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("encrypts the password before writing and never stores it in plaintext", async () => {
    const resultado = await guardarConfiguracionSmtpAction(initialState, formularioValido());

    expect(resultado).toEqual({ error: null, success: true });
    const args = mockUpsert.mock.calls[0][0];
    expect(args.where).toEqual({ id: "singleton" });
    expect(args.create.passwordCifrado).toMatch(/^v1:/);
    expect(args.create.passwordCifrado).not.toContain("clave-del-taller");
    expect(JSON.stringify(args)).not.toContain("clave-del-taller");
  });

  it("keeps the stored password when the form leaves the field blank", async () => {
    const fila = filaAlmacenada();
    mockFindUnique.mockResolvedValue(fila);
    const formData = formularioValido();
    formData.set("password", "");

    const resultado = await guardarConfiguracionSmtpAction(initialState, formData);

    expect(resultado).toEqual({ error: null, success: true });
    const args = mockUpsert.mock.calls[0][0];
    expect(args.update.passwordCifrado).toBe(fila.passwordCifrado);
  });

  it("refuses a blank password when there is no stored configuration yet", async () => {
    const formData = formularioValido();
    formData.set("password", "");

    const resultado = await guardarConfiguracionSmtpAction(initialState, formData);

    expect(resultado).toEqual({
      error: "La contraseña es obligatoria la primera vez que configuras el SMTP.",
      success: false,
    });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns the Spanish validation message for an invalid puerto", async () => {
    const formData = formularioValido();
    formData.set("puerto", "70000");

    const resultado = await guardarConfiguracionSmtpAction(initialState, formData);

    expect(resultado.success).toBe(false);
    expect(resultado.error).toBe("El puerto debe estar entre 1 y 65535");
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe("probarConfiguracionSmtpAction", () => {
  it("is ADMIN-only", async () => {
    mockFindUnique.mockResolvedValue(filaAlmacenada());

    await probarConfiguracionSmtpAction(initialState, new FormData());

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
  });

  it("refuses when no configuration is stored", async () => {
    const resultado = await probarConfiguracionSmtpAction(initialState, new FormData());

    expect(resultado).toEqual({
      error: "Configura y guarda el servidor SMTP antes de enviar una prueba.",
      success: false,
    });
    expect(mockEnviarEmail).not.toHaveBeenCalled();
  });

  it("sends the test message to the signed-in ADMIN's own address using the decrypted config", async () => {
    mockFindUnique.mockResolvedValue(filaAlmacenada("clave-guardada"));

    const resultado = await probarConfiguracionSmtpAction(initialState, new FormData());

    expect(resultado).toEqual({ error: null, success: true });
    expect(mockEnviarEmail).toHaveBeenCalledWith(
      {
        host: "smtp.viejo.test",
        puerto: 465,
        usuario: "viejo@taller.test",
        password: "clave-guardada",
        fromEmail: "viejo@taller.test",
        fromNombre: "Taller Viejo",
      },
      expect.objectContaining({ para: "admin@taller.test" }),
    );
  });

  it("reports a friendly Spanish message when the SMTP server rejects the connection", async () => {
    mockFindUnique.mockResolvedValue(filaAlmacenada());
    mockEnviarEmail.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.1:465"));

    const resultado = await probarConfiguracionSmtpAction(initialState, new FormData());

    expect(resultado.success).toBe(false);
    expect(resultado.error).toContain("No se pudo enviar el correo de prueba");
  });
});
