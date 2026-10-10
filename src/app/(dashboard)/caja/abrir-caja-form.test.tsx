import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAbrir = vi.fn();
vi.mock("@/app/actions/caja-actions", () => ({ abrirCajaAction: (...a: unknown[]) => mockAbrir(...a) }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { AbrirCajaForm } from "./abrir-caja-form";

describe("AbrirCajaForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAbrir.mockResolvedValue({ error: null, success: true });
  });

  it("envía la base inicial y la sede", async () => {
    const user = userEvent.setup();
    render(<AbrirCajaForm sedeId="s1" />);
    await user.type(screen.getByLabelText("Base inicial"), "50000");
    await user.click(screen.getByRole("button", { name: "Abrir caja" }));
    await waitFor(() => expect(mockAbrir).toHaveBeenCalledTimes(1));
    const fd = mockAbrir.mock.calls[0][1] as FormData;
    expect(fd.get("baseInicial")).toBe("50000");
    expect(fd.get("sedeId")).toBe("s1");
    expect(toast.success).toHaveBeenCalled();
  });

  it("muestra el error devuelto por la action", async () => {
    mockAbrir.mockResolvedValue({ error: "Ya hay una caja abierta en esta sede", success: false });
    const user = userEvent.setup();
    render(<AbrirCajaForm sedeId="s1" />);
    await user.type(screen.getByLabelText("Base inicial"), "0");
    await user.click(screen.getByRole("button", { name: "Abrir caja" }));
    expect(await screen.findByText("Ya hay una caja abierta en esta sede")).toBeInTheDocument();
  });

  it("si la action lanza muestra un toast de error", async () => {
    mockAbrir.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<AbrirCajaForm sedeId="s1" />);
    await user.type(screen.getByLabelText("Base inicial"), "0");
    await user.click(screen.getByRole("button", { name: "Abrir caja" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
