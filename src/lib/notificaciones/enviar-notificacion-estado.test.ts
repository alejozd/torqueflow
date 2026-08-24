import { describe, expect, it, vi } from "vitest";
import { enviarNotificacionEstadoOrden, type DatosNotificacionOrden } from "./enviar-notificacion-estado";
import type { SmtpConfigDescifrada } from "@/lib/email/smtp-config";

const SMTP: SmtpConfigDescifrada = {
  host: "smtp.taller.test",
  puerto: 587,
  usuario: "avisos@taller.test",
  password: "secreto",
  fromEmail: "avisos@taller.test",
  fromNombre: "Taller Pérez",
};

const DATOS: DatosNotificacionOrden = {
  clienteNombre: "Ana Pérez",
  clienteEmail: "ana@cliente.test",
  placa: "ABC123",
  marca: "Mazda",
  modelo: "3",
  estado: "EN_PROCESO",
};

describe("enviarNotificacionEstadoOrden", () => {
  it("sends the email and returns ENVIADA when SMTP is active and the client has an email", async () => {
    const enviarEmail = vi.fn().mockResolvedValue(undefined);

    const resultado = await enviarNotificacionEstadoOrden({ smtp: SMTP, enviarEmail }, DATOS);

    expect(resultado).toBe("ENVIADA");
    expect(enviarEmail).toHaveBeenCalledWith(SMTP, expect.objectContaining({ para: "ana@cliente.test" }));
  });

  it("returns ESTADO_NO_NOTIFICABLE without touching enviarEmail for BORRADOR/ENTREGADA", async () => {
    const enviarEmail = vi.fn();

    const resultado = await enviarNotificacionEstadoOrden(
      { smtp: SMTP, enviarEmail },
      { ...DATOS, estado: "ENTREGADA" },
    );

    expect(resultado).toBe("ESTADO_NO_NOTIFICABLE");
    expect(enviarEmail).not.toHaveBeenCalled();
  });

  it("returns SIN_SMTP_ACTIVO without touching enviarEmail when smtp is null", async () => {
    const enviarEmail = vi.fn();

    const resultado = await enviarNotificacionEstadoOrden({ smtp: null, enviarEmail }, DATOS);

    expect(resultado).toBe("SIN_SMTP_ACTIVO");
    expect(enviarEmail).not.toHaveBeenCalled();
  });

  it("returns SIN_EMAIL_CLIENTE without touching enviarEmail when the client has no email", async () => {
    const enviarEmail = vi.fn();

    const resultado = await enviarNotificacionEstadoOrden(
      { smtp: SMTP, enviarEmail },
      { ...DATOS, clienteEmail: null },
    );

    expect(resultado).toBe("SIN_EMAIL_CLIENTE");
    expect(enviarEmail).not.toHaveBeenCalled();
  });

  it("returns FALLO_ENVIO when enviarEmail throws", async () => {
    const enviarEmail = vi.fn().mockRejectedValue(new Error("ECONNREFUSED 10.0.0.5"));

    const resultado = await enviarNotificacionEstadoOrden({ smtp: SMTP, enviarEmail }, DATOS);

    expect(resultado).toBe("FALLO_ENVIO");
  });
});
