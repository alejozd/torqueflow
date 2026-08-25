import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAddManoDeObraAction = vi.fn();
vi.mock("@/app/actions/mano-de-obra-actions", () => ({
  addManoDeObraAction: (...args: unknown[]) => mockAddManoDeObraAction(...args),
}));

import { AgregarManoObraForm } from "./agregar-mano-obra-form";

describe("AgregarManoObraForm", () => {
  beforeEach(() => {
    mockAddManoDeObraAction.mockReset();
    mockAddManoDeObraAction.mockResolvedValue({ error: null, success: true });
  });

  it("shows a success message after a successful submit", async () => {
    render(<AgregarManoObraForm ordenId="o1" />);

    await userEvent.type(screen.getByLabelText("Descripción"), "Cambio de pastillas de freno");
    await userEvent.type(screen.getByLabelText("Horas"), "1.5");
    await userEvent.type(screen.getByLabelText("Precio por hora"), "20");
    await userEvent.click(screen.getByRole("button", { name: "Agregar mano de obra" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Mano de obra agregada");
  });

  it("blocks submission and shows field errors when required fields are empty, without calling the server", async () => {
    render(<AgregarManoObraForm ordenId="o1" />);

    await userEvent.click(screen.getByRole("button", { name: "Agregar mano de obra" }));

    expect(await screen.findByText("La descripción es obligatoria")).toBeInTheDocument();
    expect(mockAddManoDeObraAction).not.toHaveBeenCalled();
  });

  it("shows the server error when the action refuses an otherwise valid submission", async () => {
    mockAddManoDeObraAction.mockResolvedValue({ error: "No puedes agregar mano de obra a una orden facturada.", success: false });
    render(<AgregarManoObraForm ordenId="o1" />);

    await userEvent.type(screen.getByLabelText("Descripción"), "Cambio de pastillas de freno");
    await userEvent.type(screen.getByLabelText("Horas"), "1.5");
    await userEvent.type(screen.getByLabelText("Precio por hora"), "20");
    await userEvent.click(screen.getByRole("button", { name: "Agregar mano de obra" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No puedes agregar mano de obra a una orden facturada.");
  });
});
