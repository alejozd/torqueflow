import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import FacturasLoading from "./loading";

describe("FacturasLoading", () => {
  it("renders without throwing", () => {
    expect(() => render(<FacturasLoading />)).not.toThrow();
  });

  it("shows the page title", () => {
    render(<FacturasLoading />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Facturas"
    );
  });

  it("displays all 3 KPI card titles", () => {
    render(<FacturasLoading />);
    expect(screen.getByText("Emitidas en el mes")).toBeInTheDocument();
    expect(screen.getByText("Por cobrar")).toBeInTheDocument();
    expect(screen.getByText("Cobrado")).toBeInTheDocument();
  });

  it("shows the Listado card", () => {
    render(<FacturasLoading />);
    expect(screen.getByText("Listado")).toBeInTheDocument();
  });

  it("does not render fabricated data-dependent text", () => {
    render(<FacturasLoading />);
    // Should not render any subtitle pattern with data
    expect(screen.queryByText(/de [A-Z]/)).not.toBeInTheDocument();
  });
});
