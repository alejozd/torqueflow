import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import SedesLoading from "./loading";

describe("SedesLoading", () => {
  it("renders without throwing", () => {
    expect(() => render(<SedesLoading />)).not.toThrow();
  });

  it("shows the page title", () => {
    render(<SedesLoading />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Sedes");
  });

  it("displays all 3 KPI card titles", () => {
    render(<SedesLoading />);
    const allElements = screen.getAllByText("Sedes");
    expect(allElements.length).toBeGreaterThanOrEqual(2); // h1 + KPI card
    expect(screen.getByText("Usuarios asignados")).toBeInTheDocument();
    expect(screen.getByText("Órdenes abiertas")).toBeInTheDocument();
  });

  it("shows the Listado card", () => {
    render(<SedesLoading />);
    expect(screen.getByText("Listado")).toBeInTheDocument();
  });

  it("displays the static explanatory paragraph", () => {
    render(<SedesLoading />);
    expect(
      screen.getByText(
        /"Usuarios asignados" cuenta solo asignaciones explícitas por sede -- un administrador puede trabajar en cualquier sede aunque no aparezca aquí./
      )
    ).toBeInTheDocument();
  });

  it("does not render fabricated data-dependent text", () => {
    render(<SedesLoading />);
    // Should not render the subtitle pattern "{N} sedes registradas"
    expect(screen.queryByText(/sedes registradas/)).not.toBeInTheDocument();
  });
});
