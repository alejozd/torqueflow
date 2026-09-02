import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAddManoDeObraAction = vi.fn();
vi.mock("@/app/actions/mano-de-obra-actions", () => ({
  addManoDeObraAction: (...args: unknown[]) => mockAddManoDeObraAction(...args),
}));

import { AgregarManoObraForm } from "./agregar-mano-obra-form";

const tecnicos = [
  { id: "t1", nombre: "Carlos Ruiz" },
  { id: "t2", nombre: "Diego Salas" },
];

describe("AgregarManoObraForm", () => {
  beforeEach(() => {
    mockAddManoDeObraAction.mockReset();
    mockAddManoDeObraAction.mockResolvedValue({ error: null, success: true });
  });

  it("shows a success message after a successful submit", async () => {
    render(<AgregarManoObraForm ordenId="o1" tecnicos={tecnicos} />);

    await userEvent.type(screen.getByLabelText("Descripción"), "Cambio de pastillas de freno");
    await userEvent.type(screen.getByLabelText("Valor"), "30000");
    await userEvent.click(screen.getByRole("button", { name: "Agregar mano de obra" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Mano de obra agregada");
  });

  it("blocks submission and shows field errors when required fields are empty, without calling the server", async () => {
    render(<AgregarManoObraForm ordenId="o1" tecnicos={tecnicos} />);

    await userEvent.click(screen.getByRole("button", { name: "Agregar mano de obra" }));

    expect(await screen.findByText("La descripción es obligatoria")).toBeInTheDocument();
    expect(await screen.findByText("El valor es obligatorio")).toBeInTheDocument();
    expect(mockAddManoDeObraAction).not.toHaveBeenCalled();
  });

  it("shows the server error when the action refuses an otherwise valid submission", async () => {
    mockAddManoDeObraAction.mockResolvedValue({ error: "No puedes agregar mano de obra a una orden facturada.", success: false });
    render(<AgregarManoObraForm ordenId="o1" tecnicos={tecnicos} />);

    await userEvent.type(screen.getByLabelText("Descripción"), "Cambio de pastillas de freno");
    await userEvent.type(screen.getByLabelText("Valor"), "30000");
    await userEvent.click(screen.getByRole("button", { name: "Agregar mano de obra" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No puedes agregar mano de obra a una orden facturada.");
  });

  it("lets a técnico be picked per línea, independent of the orden's own mecánico", async () => {
    render(<AgregarManoObraForm ordenId="o1" tecnicos={tecnicos} />);

    const trigger = screen.getByRole("combobox", { name: "Mecánico" });
    expect(trigger).toHaveTextContent("Sin asignar");
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("option", { name: "Diego Salas" }));
    expect(trigger).toHaveTextContent("Diego Salas");
  });

  it("preselects the orden's mecánico as a discreet default, still changeable", () => {
    render(<AgregarManoObraForm ordenId="o1" tecnicos={tecnicos} mecanicoIdHeader="t1" />);

    expect(screen.getByRole("combobox", { name: "Mecánico" })).toHaveTextContent("Carlos Ruiz");
  });
});
