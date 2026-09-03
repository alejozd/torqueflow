import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ProveedoresLoading from "./loading";

describe("ProveedoresLoading", () => {
  it("renders without throwing", () => {
    expect(() => render(<ProveedoresLoading />)).not.toThrow();
  });

  it("shows the page title", () => {
    render(<ProveedoresLoading />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Proveedores");
  });

  it("shows the Listado card", () => {
    render(<ProveedoresLoading />);
    expect(screen.getByText("Listado")).toBeInTheDocument();
  });

  it("does not show fabricated dynamic text (subtitle should be skeleton)", () => {
    render(<ProveedoresLoading />);
    // The subtitle "X proveedores registrados" should NOT appear
    expect(screen.queryByText(/proveedores registrados/)).not.toBeInTheDocument();
  });

  it("does not show fabricated button text (should be skeleton)", () => {
    render(<ProveedoresLoading />);
    // The "Nuevo proveedor" button should NOT appear as a real button, only as skeleton
    expect(screen.queryByRole("link", { name: /Nuevo proveedor/ })).not.toBeInTheDocument();
  });
});
