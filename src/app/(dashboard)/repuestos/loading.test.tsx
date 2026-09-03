import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import RepuestosLoading from "./loading";

describe("RepuestosLoading", () => {
  it("renders without throwing", () => {
    expect(() => render(<RepuestosLoading />)).not.toThrow();
  });

  it("shows the page title", () => {
    render(<RepuestosLoading />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Repuestos");
  });

  it("displays all 3 KPI card titles", () => {
    render(<RepuestosLoading />);
    expect(screen.getByText("Referencias")).toBeInTheDocument();
    expect(screen.getByText("Valor inventario")).toBeInTheDocument();
    expect(screen.getByText("Stock bajo")).toBeInTheDocument();
  });

  it("shows the Listado card", () => {
    render(<RepuestosLoading />);
    expect(screen.getByText("Listado")).toBeInTheDocument();
  });
});
