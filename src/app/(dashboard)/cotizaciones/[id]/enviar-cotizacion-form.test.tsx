import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockEnviarCotizacionAction = vi.fn();
vi.mock("@/app/actions/cotizacion-actions", () => ({
  enviarCotizacionAction: (...args: unknown[]) => mockEnviarCotizacionAction(...args),
}));

import { EnviarCotizacionForm } from "./enviar-cotizacion-form";

const RESUMEN = { numero: 42, placa: "ABC123", total: 250000 };

async function selectCanal(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole("combobox"));
  await user.click(await screen.findByRole("option", { name: label }));
}

describe("EnviarCotizacionForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockEnviarCotizacionAction.mockReset();
  });

  it("shows the EMAIL caption by default", () => {
    render(
      <EnviarCotizacionForm
        cotizacionId="q1"
        cliente={{ nombre: "Ana Pérez", telefono: "3001234567" }}
        resumen={RESUMEN}
      />,
    );

    expect(screen.getByText("Se enviará un correo real al cliente.")).toBeInTheDocument();
  });

  it("updates the caption when the canal selection changes", async () => {
    const user = userEvent.setup();
    render(
      <EnviarCotizacionForm
        cotizacionId="q1"
        cliente={{ nombre: "Ana Pérez", telefono: "3001234567" }}
        resumen={RESUMEN}
      />,
    );

    await selectCanal(user, "WhatsApp");
    expect(
      screen.getByText("Se abrirá WhatsApp con un mensaje prellenado — no requiere API de WhatsApp."),
    ).toBeInTheDocument();

    await selectCanal(user, "Otro");
    expect(
      screen.getByText(
        "Solo registra que ya la compartiste por otro medio (en persona, llamada, etc.) — no se envía nada automáticamente.",
      ),
    ).toBeInTheDocument();
  });

  it("shows an inline error and does not call the server action when WHATSAPP is selected with no telefono", async () => {
    const user = userEvent.setup();
    mockEnviarCotizacionAction.mockResolvedValue({ error: null, success: true });
    render(
      <EnviarCotizacionForm cotizacionId="q1" cliente={{ nombre: "Ana Pérez", telefono: null }} resumen={RESUMEN} />,
    );

    await selectCanal(user, "WhatsApp");
    await user.click(screen.getByRole("button", { name: "Enviar al cliente" }));

    expect(await screen.findByText("Este cliente no tiene teléfono registrado.")).toBeInTheDocument();
    expect(mockEnviarCotizacionAction).not.toHaveBeenCalled();
  });

  it("opens a wa.me link with the normalized Colombian number before calling the server action", async () => {
    const user = userEvent.setup();
    const callOrder: string[] = [];
    const windowOpenSpy = vi.spyOn(window, "open").mockImplementation((url) => {
      callOrder.push(`open:${String(url)}`);
      return null;
    });
    mockEnviarCotizacionAction.mockImplementation(async () => {
      callOrder.push("action");
      return { error: null, success: true };
    });

    render(
      <EnviarCotizacionForm
        cotizacionId="q1"
        cliente={{ nombre: "Ana Pérez", telefono: "300 123 4567" }}
        resumen={RESUMEN}
      />,
    );

    await selectCanal(user, "WhatsApp");
    await user.click(screen.getByRole("button", { name: "Enviar al cliente" }));

    await waitFor(() => expect(mockEnviarCotizacionAction).toHaveBeenCalled());

    expect(windowOpenSpy).toHaveBeenCalledTimes(1);
    const [url, target] = windowOpenSpy.mock.calls[0];
    expect(String(url)).toMatch(/^https:\/\/wa\.me\/573001234567\?text=/);
    expect(target).toBe("_blank");
    expect(callOrder[0]).toMatch(/^open:/);
    expect(callOrder[1]).toBe("action");
  });
});
