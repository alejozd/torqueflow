import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import CitasLoading from "./loading";

describe("CitasLoading", () => {
  it("renders without throwing", () => {
    expect(() => render(<CitasLoading />)).not.toThrow();
  });

  it("shows the page title", () => {
    render(<CitasLoading />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Citas");
  });

  it("displays all 3 KPI card titles", () => {
    render(<CitasLoading />);
    expect(screen.getByText("Hoy")).toBeInTheDocument();
    expect(screen.getByText("Confirmadas")).toBeInTheDocument();
    expect(screen.getByText("Canceladas")).toBeInTheDocument();
  });

  it("shows the Listado card", () => {
    render(<CitasLoading />);
    expect(screen.getByText("Listado")).toBeInTheDocument();
  });

  it("does not render fabricated data-dependent text", () => {
    render(<CitasLoading />);
    // Should not render the subtitle pattern "Agenda de {sede} · semana del {rango}"
    expect(screen.queryByText(/Agenda de/)).not.toBeInTheDocument();
    // Should not render any date range text (e.g., "1 de enero al 7 de enero")
    expect(screen.queryByText(/semana del/)).not.toBeInTheDocument();
  });
});
