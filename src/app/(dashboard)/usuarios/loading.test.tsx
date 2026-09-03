import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import UsuariosLoading from "./loading";

describe("UsuariosLoading", () => {
  it("renders without throwing", () => {
    expect(() => render(<UsuariosLoading />)).not.toThrow();
  });

  it("shows the page title", () => {
    render(<UsuariosLoading />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Usuarios");
  });

  it("displays all 3 KPI card titles", () => {
    render(<UsuariosLoading />);
    expect(screen.getByText("Administradores")).toBeInTheDocument();
    expect(screen.getByText("Técnicos")).toBeInTheDocument();
    expect(screen.getByText("Recepción")).toBeInTheDocument();
  });

  it("shows the Listado card", () => {
    render(<UsuariosLoading />);
    expect(screen.getByText("Listado")).toBeInTheDocument();
  });

  it("does not render fabricated data-dependent text", () => {
    render(<UsuariosLoading />);
    // Should not render the subtitle pattern "{N} usuarios registrados"
    expect(screen.queryByText(/usuarios registrados/)).not.toBeInTheDocument();
    // Should not render the "Crear usuario" button text (it's a skeleton)
    expect(screen.queryByRole("link", { name: /Crear usuario/ })).not.toBeInTheDocument();
  });
});
