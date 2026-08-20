import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCreateBodegaAction = vi.fn();
vi.mock("@/app/actions/bodega-actions", () => ({
  createBodegaAction: (...args: unknown[]) => mockCreateBodegaAction(...args),
}));

import { NuevoBodegaForm } from "./nuevo-bodega-form";

describe("NuevoBodegaForm", () => {
  beforeEach(() => {
    mockCreateBodegaAction.mockReset();
    mockCreateBodegaAction.mockResolvedValue({ error: null, success: true });
  });

  it("shows a success message after a successful submit", async () => {
    render(<NuevoBodegaForm />);

    await userEvent.type(screen.getByLabelText("Nombre"), "Bodega norte");
    await userEvent.click(screen.getByRole("button", { name: "Crear bodega" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Bodega creada");
  });

  it("shows the error message when the action returns one", async () => {
    mockCreateBodegaAction.mockResolvedValue({ error: "El nombre es obligatorio", success: false });
    render(<NuevoBodegaForm />);

    await userEvent.click(screen.getByRole("button", { name: "Crear bodega" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El nombre es obligatorio");
  });
});
