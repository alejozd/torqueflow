import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import SuperAdminLoading from "./loading";

describe("SuperAdminLoading", () => {
  it("renders without throwing", () => {
    expect(() => render(<SuperAdminLoading />)).not.toThrow();
  });

  it("shows the page title", () => {
    render(<SuperAdminLoading />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Talleres");
  });

  it("shows the Listado card", () => {
    render(<SuperAdminLoading />);
    expect(screen.getByText("Listado")).toBeInTheDocument();
  });

  it("does not show fabricated subtitle text", () => {
    render(<SuperAdminLoading />);
    // The real page has data-dependent text like "N talleres registrados"
    // The skeleton should not have this text fabricated
    expect(screen.queryByText(/talleres registrados/)).not.toBeInTheDocument();
  });
});
