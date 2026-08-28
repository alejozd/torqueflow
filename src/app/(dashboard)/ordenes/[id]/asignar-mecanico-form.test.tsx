import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAsignarMecanicoAction = vi.fn();
vi.mock("@/app/actions/orden-actions", () => ({
  asignarMecanicoAction: (...args: unknown[]) => mockAsignarMecanicoAction(...args),
}));

import { AsignarMecanicoForm } from "./asignar-mecanico-form";

const tecnicos = [
  { id: "t1", nombre: "Carlos Ruiz" },
  { id: "t2", nombre: "Diego Salas" },
];

describe("AsignarMecanicoForm", () => {
  beforeEach(() => {
    mockAsignarMecanicoAction.mockReset();
    mockAsignarMecanicoAction.mockResolvedValue({ error: null, success: true });
  });

  it("preselects the current mecánico, with 'Sin asignar' as an explicit option", () => {
    render(<AsignarMecanicoForm ordenId="o1" mecanicoIdActual="t1" tecnicos={tecnicos} />);

    const select = screen.getByRole<HTMLSelectElement>("combobox");
    expect(select.value).toBe("t1");
    expect(screen.getByRole("option", { name: "Sin asignar" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Diego Salas" })).toBeInTheDocument();
  });

  it("defaults to 'Sin asignar' when the orden has no mecánico yet", () => {
    render(<AsignarMecanicoForm ordenId="o1" mecanicoIdActual={null} tecnicos={tecnicos} />);

    expect(screen.getByRole<HTMLSelectElement>("combobox").value).toBe("");
  });

  it("shows a success message after reassigning", async () => {
    render(<AsignarMecanicoForm ordenId="o1" mecanicoIdActual={null} tecnicos={tecnicos} />);

    await userEvent.selectOptions(screen.getByRole("combobox"), "t2");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Mecánico actualizado");
  });

  it("shows the server error when the orden cannot be modified", async () => {
    mockAsignarMecanicoAction.mockResolvedValue({
      error: "No se puede modificar una orden en estado ENTREGADA.",
      success: false,
    });
    render(<AsignarMecanicoForm ordenId="o1" mecanicoIdActual="t1" tecnicos={tecnicos} />);

    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("No se puede modificar una orden en estado ENTREGADA.")).toBeInTheDocument();
  });
});
