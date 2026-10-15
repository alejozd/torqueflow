import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAsignar = vi.fn();
vi.mock("@/app/actions/orden-actions", () => ({
  asignarMecanicoAction: (...args: unknown[]) => mockAsignar(...args),
}));

import { MecanicoMenu } from "./mecanico-menu";

const TECNICOS = [
  { id: "t1", nombre: "Luis Torres" },
  { id: "t2", nombre: "Carlos Ruiz" },
];

describe("MecanicoMenu", () => {
  beforeEach(() => {
    mockAsignar.mockReset().mockResolvedValue({ error: null, success: true });
  });

  it("muestra el mecánico y guarda al elegir otro", async () => {
    render(<MecanicoMenu ordenId="o1" mecanico={TECNICOS[0]!} tecnicos={TECNICOS} editable />);
    expect(screen.getByText("Luis Torres")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Cambiar/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Carlos Ruiz" }));
    expect((mockAsignar.mock.calls[0]![2] as FormData).get("mecanicoId")).toBe("t2");
    expect(await screen.findByRole("status")).toHaveTextContent("Guardado");
  });

  it("sin mecánico dice Asignar y no ofrece «Sin asignar»", async () => {
    render(<MecanicoMenu ordenId="o1" mecanico={null} tecnicos={TECNICOS} editable />);
    expect(screen.getByText("Sin asignar")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Asignar/ }));
    expect(await screen.findByRole("menuitem", { name: "Luis Torres" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Sin asignar" })).not.toBeInTheDocument();
  });

  it("el actual no se puede volver a elegir", async () => {
    render(<MecanicoMenu ordenId="o1" mecanico={TECNICOS[0]!} tecnicos={TECNICOS} editable />);
    await userEvent.click(screen.getByRole("button", { name: /Cambiar/ }));
    expect(await screen.findByRole("menuitem", { name: "Luis Torres" })).toHaveAttribute("aria-disabled", "true");
  });

  it("sin permiso solo muestra el nombre", () => {
    render(<MecanicoMenu ordenId="o1" mecanico={TECNICOS[0]!} tecnicos={TECNICOS} editable={false} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("muestra el error de la acción", async () => {
    mockAsignar.mockResolvedValue({ error: "Esta orden ya tiene un mecánico asignado", success: false });
    render(<MecanicoMenu ordenId="o1" mecanico={null} tecnicos={TECNICOS} editable />);
    await userEvent.click(screen.getByRole("button", { name: /Asignar/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Carlos Ruiz" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ya tiene un mecánico asignado");
  });
});
