import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import BodegasLoading from "./loading";

describe("BodegasLoading", () => {
  it("renders without throwing", () => {
    expect(() => render(<BodegasLoading />)).not.toThrow();
  });

  it("shows the page title", () => {
    render(<BodegasLoading />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bodegas");
  });

  it("shows the Listado card", () => {
    render(<BodegasLoading />);
    expect(screen.getByText("Listado")).toBeInTheDocument();
  });

  it("does not show fabricated dynamic text (subtitle should be skeleton)", () => {
    render(<BodegasLoading />);
    // The subtitle "X bodegas registradas en Sede Y" should NOT appear
    expect(screen.queryByText(/bodegas registradas/)).not.toBeInTheDocument();
  });

  it("does not show fabricated button text (should be skeleton)", () => {
    render(<BodegasLoading />);
    // The "Nueva bodega" button should NOT appear as a real button, only as skeleton
    expect(screen.queryByRole("link", { name: /Nueva bodega/ })).not.toBeInTheDocument();
  });
});
