import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSendMail = vi.fn();
const mockCreateTransport = vi.fn((..._args: unknown[]) => ({ sendMail: mockSendMail }));
vi.mock("nodemailer", () => ({
  default: { createTransport: (...args: unknown[]) => mockCreateTransport(...args) },
}));

import { enviarEmail } from "./enviar-email";
import type { SmtpConfigDescifrada } from "./smtp-config";

const config: SmtpConfigDescifrada = {
  host: "smtp.taller.test",
  puerto: 587,
  usuario: "avisos@taller.test",
  password: "clave-del-taller",
  fromEmail: "avisos@taller.test",
  fromNombre: "Taller Pérez",
};

const mensaje = {
  para: "ana@cliente.test",
  asunto: "Recordatorio",
  texto: "Texto plano",
  html: "<p>Texto plano</p>",
};

beforeEach(() => {
  mockSendMail.mockReset().mockResolvedValue({ messageId: "abc" });
  mockCreateTransport.mockClear();
});

describe("enviarEmail", () => {
  it("builds the transport from the decrypted config", async () => {
    await enviarEmail(config, mensaje);

    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: "smtp.taller.test",
      port: 587,
      secure: false,
      auth: { user: "avisos@taller.test", pass: "clave-del-taller" },
    });
  });

  it("uses implicit TLS on port 465, the only port where SMTP starts encrypted", async () => {
    await enviarEmail({ ...config, puerto: 465 }, mensaje);

    expect(mockCreateTransport).toHaveBeenCalledWith(expect.objectContaining({ secure: true }));
  });

  it("sends the message with a named From and both bodies", async () => {
    await enviarEmail(config, mensaje);

    expect(mockSendMail).toHaveBeenCalledWith({
      from: '"Taller Pérez" <avisos@taller.test>',
      to: "ana@cliente.test",
      subject: "Recordatorio",
      text: "Texto plano",
      html: "<p>Texto plano</p>",
    });
  });

  it("propagates a transport failure so the caller can count it as failed", async () => {
    mockSendMail.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(enviarEmail(config, mensaje)).rejects.toThrow("ECONNREFUSED");
  });
});
