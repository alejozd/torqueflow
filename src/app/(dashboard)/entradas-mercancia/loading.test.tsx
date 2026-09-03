import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import EntradasMercanciaLoading from "./loading";

describe("Entradas de mercancía Loading Skeleton", () => {
  it("renders without crashing", () => {
    const { container } = render(<EntradasMercanciaLoading />);
    expect(container).toBeInTheDocument();
  });

  it("displays the page title", () => {
    const { getByText } = render(<EntradasMercanciaLoading />);
    expect(getByText("Entradas de mercancía")).toBeInTheDocument();
  });

  it("displays all KPI card titles", () => {
    const { getByText } = render(<EntradasMercanciaLoading />);
    expect(getByText("Entradas registradas")).toBeInTheDocument();
    expect(getByText("Unidades recibidas")).toBeInTheDocument();
    expect(getByText("Costo total")).toBeInTheDocument();
  });

  it("displays the Listado card title", () => {
    const { getByText } = render(<EntradasMercanciaLoading />);
    expect(getByText("Listado")).toBeInTheDocument();
  });
});
