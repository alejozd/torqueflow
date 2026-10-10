import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CobrarWhatsappButton } from "./cobrar-whatsapp-button";

describe("CobrarWhatsappButton", () => {
  beforeEach(() => {
    vi.spyOn(window, "open").mockReturnValue(null);
  });

  it("deshabilitado sin teléfono", () => {
    render(<CobrarWhatsappButton urlWhatsapp={null} />);
    expect(screen.getByRole("button", { name: /Cobrar por WhatsApp/ })).toBeDisabled();
  });

  it("abre el enlace wa.me", async () => {
    render(<CobrarWhatsappButton urlWhatsapp="https://wa.me/573105550142?text=x" />);
    await userEvent.click(screen.getByRole("button", { name: /Cobrar por WhatsApp/ }));
    expect(window.open).toHaveBeenCalledWith("https://wa.me/573105550142?text=x", "_blank", "noopener");
  });
});
