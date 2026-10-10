import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAprobar = vi.fn();
const mockRechazar = vi.fn();
const mockPush = vi.fn();
vi.mock("@/app/actions/cotizacion-actions", () => ({
  aprobarCotizacionAction: (...args: unknown[]) => mockAprobar(...args),
  rechazarCotizacionAction: (...args: unknown[]) => mockRechazar(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DecisionCotizacionButtons } from "./decision-cotizacion-buttons";

describe("DecisionCotizacionButtons", () => {
  beforeEach(() => {
    mockAprobar.mockReset();
    mockRechazar.mockReset();
    mockPush.mockReset();
  });

  it("asks before approving, then approves and opens the new orden", async () => {
    mockAprobar.mockResolvedValue({ error: null, success: true, ordenId: "o9" });
    render(<DecisionCotizacionButtons cotizacionId="c1" />);

    await userEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    expect(mockAprobar).not.toHaveBeenCalled();
    expect(screen.getByText("¿Aprobar la cotización? Se creará una orden de trabajo con sus ítems.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sí, aprobar" }));
    await vi.waitFor(() => expect(mockPush).toHaveBeenCalledWith("/ordenes/o9"));
  });

  it("asks before rejecting, then rejects", async () => {
    mockRechazar.mockResolvedValue({ error: null, success: true });
    render(<DecisionCotizacionButtons cotizacionId="c1" />);

    await userEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    expect(mockRechazar).not.toHaveBeenCalled();
    expect(screen.getByText("¿Rechazar la cotización?")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sí, rechazar" }));
    await vi.waitFor(() => expect(mockRechazar).toHaveBeenCalledWith("c1", expect.anything(), expect.any(FormData)));
  });

  it("'No' returns to both buttons without calling anything", async () => {
    render(<DecisionCotizacionButtons cotizacionId="c1" />);

    await userEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    await userEvent.click(screen.getByRole("button", { name: "No" }));

    expect(mockAprobar).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Rechazar" })).toBeInTheDocument();
  });
});
