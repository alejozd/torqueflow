import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ClientesLoading from "./loading";

describe("ClientesLoading", () => {
  it("renders without throwing", () => {
    expect(() => render(<ClientesLoading />)).not.toThrow();
  });

  it("shows the page title", () => {
    render(<ClientesLoading />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Clientes");
  });

  it("shows the Listado card", () => {
    render(<ClientesLoading />);
    expect(screen.getByText("Listado")).toBeInTheDocument();
  });
});
