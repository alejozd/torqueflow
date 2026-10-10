import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRegistrar = vi.fn();
vi.mock("@/app/actions/vencimiento-actions", () => ({
  registrarAvisoWhatsappAction: (...args: unknown[]) => mockRegistrar(...args),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AvisarWhatsappButton } from "./avisar-whatsapp-button";

describe("AvisarWhatsappButton", () => {
  beforeEach(() => {
    mockRegistrar.mockReset().mockResolvedValue({ error: null });
    vi.spyOn(window, "open").mockReturnValue(null);
  });

  it("deshabilitado sin teléfono", () => {
    render(<AvisarWhatsappButton vehiculoId="v1" tipo="SOAT" urlWhatsapp={null} />);
    expect(screen.getByRole("button", { name: /Avisar por WhatsApp/ })).toBeDisabled();
  });

  it("abre wa.me y registra el aviso", async () => {
    render(<AvisarWhatsappButton vehiculoId="v1" tipo="SOAT" urlWhatsapp="https://wa.me/573105550142?text=x" />);
    await userEvent.click(screen.getByRole("button", { name: /Avisar por WhatsApp/ }));
    expect(window.open).toHaveBeenCalledWith("https://wa.me/573105550142?text=x", "_blank", "noopener");
    expect(mockRegistrar).toHaveBeenCalledWith("v1", "SOAT");
  });
});
