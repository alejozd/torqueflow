import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const mockSetUsuarioSedesAction = vi.fn();
vi.mock("@/app/actions/usuario-actions", () => ({
  setUsuarioSedesAction: (...args: unknown[]) => mockSetUsuarioSedesAction(...args),
}));

import { AsignarSedesForm } from "./asignar-sedes-form";

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
    render(<AsignarSedesForm usuario={USUARIO} sedes={SEDES} />);

    expect(screen.getByLabelText("Sede principal para Tec E2E")).toBeInTheDocument();
    expect(screen.getByLabelText("Sede norte para Tec E2E")).toBeInTheDocument();
  });

  it("pre-checks exactly the sedes the user is already assigned to", () => {
    render(<AsignarSedesForm usuario={USUARIO} sedes={SEDES} />);

    expect(screen.getByLabelText("Sede principal para Tec E2E")).toBeChecked();
    expect(screen.getByLabelText("Sede norte para Tec E2E")).not.toBeChecked();
  });

  it("submits every checkbox under the same sedeIds name", () => {
    render(<AsignarSedesForm usuario={USUARIO} sedes={SEDES} />);

    expect(screen.getByLabelText("Sede principal para Tec E2E")).toHaveAttribute("name", "sedeIds");
    expect(screen.getByLabelText("Sede norte para Tec E2E")).toHaveAttribute("name", "sedeIds");
  });

  it("labels its submit button with the user's name", () => {
    render(<AsignarSedesForm usuario={USUARIO} sedes={SEDES} />);

    expect(screen.getByRole("button", { name: "Guardar sedes de Tec E2E" })).toBeInTheDocument();
  });
});
