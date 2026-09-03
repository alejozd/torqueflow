import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "@/components/ui/dialog";

const mockSetUsuarioSedesAction = vi.fn();
vi.mock("@/app/actions/usuario-actions", () => ({
  setUsuarioSedesAction: (...args: unknown[]) => mockSetUsuarioSedesAction(...args),
}));

import { AsignarSedesForm } from "./asignar-sedes-form";

// AsignarSedesForm renders a DialogClose-wrapped Cancel button that requires
// a Dialog ancestor (same as every dialog-only form in this app) -- render
// through a real Dialog instead of the bare component.
function renderInDialog(ui: Parameters<typeof render>[0]) {
  return render(<Dialog open>{ui}</Dialog>);
}

const SEDES = [
  { id: "sede-1", nombre: "Sede principal" },
  { id: "sede-2", nombre: "Sede norte" },
];

const USUARIO = {
  id: "u2",
  nombre: "Tec E2E",
  email: "tec@example.test",
  role: "TECNICO" as const,
  sedeIds: ["sede-1"],
};

describe("AsignarSedesForm", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders one uniquely-labelled checkbox per sede", () => {
    renderInDialog(<AsignarSedesForm usuario={USUARIO} sedes={SEDES} />);

    expect(screen.getByLabelText("Sede principal para Tec E2E")).toBeInTheDocument();
    expect(screen.getByLabelText("Sede norte para Tec E2E")).toBeInTheDocument();
  });

  it("pre-checks exactly the sedes the user is already assigned to", () => {
    renderInDialog(<AsignarSedesForm usuario={USUARIO} sedes={SEDES} />);

    expect(screen.getByLabelText("Sede principal para Tec E2E")).toBeChecked();
    expect(screen.getByLabelText("Sede norte para Tec E2E")).not.toBeChecked();
  });

  it("submits every checkbox under the same sedeIds name", () => {
    renderInDialog(<AsignarSedesForm usuario={USUARIO} sedes={SEDES} />);

    expect(screen.getByLabelText("Sede principal para Tec E2E")).toHaveAttribute("name", "sedeIds");
    expect(screen.getByLabelText("Sede norte para Tec E2E")).toHaveAttribute("name", "sedeIds");
  });

  it("labels its submit button with the user's name", () => {
    renderInDialog(<AsignarSedesForm usuario={USUARIO} sedes={SEDES} />);

    expect(screen.getByRole("button", { name: "Guardar sedes de Tec E2E" })).toBeInTheDocument();
  });

  it("blocks submission and shows a field error when every checkbox is unchecked, without calling the server", async () => {
    renderInDialog(<AsignarSedesForm usuario={{ ...USUARIO, sedeIds: [] }} sedes={SEDES} />);

    await userEvent.click(screen.getByRole("button", { name: "Guardar sedes de Tec E2E" }));

    expect(await screen.findByText("Selecciona al menos una sede")).toBeInTheDocument();
    expect(mockSetUsuarioSedesAction).not.toHaveBeenCalled();
  });
});
