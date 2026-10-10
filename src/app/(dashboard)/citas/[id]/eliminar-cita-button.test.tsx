import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockDelete = vi.fn();
const mockPush = vi.fn();
vi.mock("@/app/actions/cita-actions", () => ({ deleteCitaFormAction: (...args: unknown[]) => mockDelete(...args) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

import { EliminarCitaButton } from "./eliminar-cita-button";

describe("EliminarCitaButton", () => {
  it("asks first, deletes, and goes back to /citas", async () => {
    mockDelete.mockResolvedValue({ error: null, success: true });
    render(<EliminarCitaButton citaId="c1" descripcion="ABC123 · 10 oct, 9:00" />);

    await userEvent.click(screen.getByRole("button", { name: /Eliminar cita/ }));
    expect(mockDelete).not.toHaveBeenCalled();
    expect(screen.getByText(/¿Eliminar la cita ABC123 · 10 oct, 9:00\?/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));
    await vi.waitFor(() => expect(mockDelete).toHaveBeenCalledWith("c1"));
    await vi.waitFor(() => expect(mockPush).toHaveBeenCalledWith("/citas"));
  });
});
