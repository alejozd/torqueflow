import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VencimientoBadge } from "./vencimiento-badge";

describe("VencimientoBadge", () => {
  it("muestra 'Sin registrar' sin fecha", () => {
    render(<VencimientoBadge estado="SIN_DATO" fecha={null} />);
    expect(screen.getByText("Sin registrar")).toBeInTheDocument();
  });

  it("muestra estado y fecha sin correrla de día", () => {
    render(<VencimientoBadge estado="VENCIDO" fecha={new Date("2026-09-12T00:00:00Z")} />);
    expect(screen.getByText(/Vencido/)).toBeInTheDocument();
    expect(screen.getByText(/12\/09\/2026/)).toBeInTheDocument();
  });
});
