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

  it("shows the assigned mecánico as read-only text, with no picker", () => {
    render(<AsignarMecanicoForm ordenId="o1" mecanico={{ id: "t1", nombre: "Carlos Ruiz" }} tecnicos={tecnicos} />);

    expect(screen.getByText("Carlos Ruiz")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the picker with 'Sin asignar' selected when no mecánico is assigned yet", async () => {
    render(<AsignarMecanicoForm ordenId="o1" mecanico={null} tecnicos={tecnicos} />);

    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveTextContent("Sin asignar");
    await userEvent.click(trigger);
    expect(await screen.findByRole("option", { name: "Sin asignar" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Diego Salas" })).toBeInTheDocument();
  });

  it("submits the chosen mecánico via the Asignar button", async () => {
    render(<AsignarMecanicoForm ordenId="o1" mecanico={null} tecnicos={tecnicos} />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "Diego Salas" }));
    await userEvent.click(screen.getByRole("button", { name: "Asignar" }));

    expect(mockAsignarMecanicoAction).toHaveBeenCalled();
    const formData = mockAsignarMecanicoAction.mock.calls[0][2] as FormData;
    expect(formData.get("mecanicoId")).toBe("t2");
  });

  it("still shows the editable picker to ADMIN (puedeReasignar) after a mecánico is assigned", async () => {
    render(
      <AsignarMecanicoForm
        ordenId="o1"
        mecanico={{ id: "t1", nombre: "Carlos Ruiz" }}
        tecnicos={tecnicos}
        puedeReasignar
      />,
    );

    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveTextContent("Carlos Ruiz");
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();

    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("option", { name: "Diego Salas" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(mockAsignarMecanicoAction).toHaveBeenCalled();
  });

  it("shows the server error when the assignment is refused", async () => {
    mockAsignarMecanicoAction.mockResolvedValue({
      error: "Esta orden ya tiene un mecánico asignado y no se puede modificar.",
      success: false,
    });
    render(<AsignarMecanicoForm ordenId="o1" mecanico={null} tecnicos={tecnicos} />);

    await userEvent.click(screen.getByRole("button", { name: "Asignar" }));

    expect(
      await screen.findByText("Esta orden ya tiene un mecánico asignado y no se puede modificar."),
    ).toBeInTheDocument();
  });
});
