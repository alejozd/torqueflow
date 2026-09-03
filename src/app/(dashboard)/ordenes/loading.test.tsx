import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import OrdenesLoading from "./loading";

describe("OrdenesLoading", () => {
  it("renders without throwing", () => {
    expect(() => render(<OrdenesLoading />)).not.toThrow();
  });

  it("shows the page title", () => {
    render(<OrdenesLoading />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Órdenes de trabajo");
  });

  it("displays all 4 KPI card titles", () => {
    render(<OrdenesLoading />);
    expect(screen.getByText("En proceso")).toBeInTheDocument();
    expect(screen.getByText("Terminadas sin facturar")).toBeInTheDocument();
    expect(screen.getByText("Tiempo medio")).toBeInTheDocument();
    expect(screen.getByText("Ticket medio")).toBeInTheDocument();
  });

  it("shows the Listado card", () => {
    render(<OrdenesLoading />);
    expect(screen.getByText("Listado")).toBeInTheDocument();
  });
});
