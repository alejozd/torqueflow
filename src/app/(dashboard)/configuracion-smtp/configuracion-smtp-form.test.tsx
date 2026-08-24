import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/actions/smtp-actions", () => ({
  guardarConfiguracionSmtpAction: vi.fn(),
  probarConfiguracionSmtpAction: vi.fn(),
}));

import { ConfiguracionSmtpForm } from "./configuracion-smtp-form";

const configuracion = {
  host: "smtp.taller.test",
  puerto: 587,
  usuario: "avisos@taller.test",
  fromEmail: "avisos@taller.test",
  fromNombre: "Taller Pérez",
  activo: true,
  passwordConfigurada: true,
};

describe("ConfiguracionSmtpForm", () => {
  it("prefills every stored field except the password", () => {
    render(<ConfiguracionSmtpForm configuracion={configuracion} />);

    expect(screen.getByLabelText<HTMLInputElement>("Servidor SMTP").value).toBe("smtp.taller.test");
    expect(screen.getByLabelText<HTMLInputElement>("Puerto").value).toBe("587");
    expect(screen.getByLabelText<HTMLInputElement>("Usuario").value).toBe("avisos@taller.test");
    expect(screen.getByLabelText<HTMLInputElement>("Correo remitente").value).toBe("avisos@taller.test");
    expect(screen.getByLabelText<HTMLInputElement>("Nombre del remitente").value).toBe("Taller Pérez");
    expect(screen.getByLabelText<HTMLInputElement>("Contraseña").value).toBe("");
  });

  it("masks the password field and tells the admin that leaving it blank keeps the stored one", () => {
    render(<ConfiguracionSmtpForm configuracion={configuracion} />);

    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("type", "password");
    expect(screen.getByText("Déjala en blanco para conservar la contraseña guardada.")).toBeInTheDocument();
  });

  it("marks the password as required when nothing is stored yet", () => {
    render(<ConfiguracionSmtpForm configuracion={null} />);

    expect(screen.getByLabelText("Contraseña")).toBeRequired();
    expect(
      screen.queryByText("Déjala en blanco para conservar la contraseña guardada."),
    ).not.toBeInTheDocument();
  });

  it("renders the activo checkbox reflecting the stored value", () => {
    render(<ConfiguracionSmtpForm configuracion={{ ...configuracion, activo: false }} />);

    expect(screen.getByLabelText<HTMLInputElement>("Enviar recordatorios")).not.toBeChecked();
  });

  it("offers the test-send button only once a configuration is stored", () => {
    render(<ConfiguracionSmtpForm configuracion={configuracion} />);
    expect(screen.getByRole("button", { name: "Enviar correo de prueba" })).toBeInTheDocument();
  });

  it("hides the test-send button when nothing is stored yet", () => {
    render(<ConfiguracionSmtpForm configuracion={null} />);
    expect(screen.queryByRole("button", { name: "Enviar correo de prueba" })).not.toBeInTheDocument();
  });
});
