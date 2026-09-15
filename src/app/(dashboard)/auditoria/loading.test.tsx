import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import AuditoriaLoading from "./loading";

describe("AuditoriaLoading", () => {
  it("renders without throwing", () => {
    expect(() => render(<AuditoriaLoading />)).not.toThrow();
  });

  it("shows the page title", () => {
    render(<AuditoriaLoading />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Auditoría");
  });

  it("shows the Eventos card", () => {
    render(<AuditoriaLoading />);
    expect(screen.getByText("Eventos")).toBeInTheDocument();
  });
});
