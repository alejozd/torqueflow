import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CicloOrden } from "./ciclo-orden";

describe("CicloOrden", () => {
  it("marca los pasos hechos, el actual y los que faltan", () => {
    render(<CicloOrden estado="EN_PROCESO" />);
    const pasos = screen.getAllByRole("listitem");
    expect(pasos.map((paso) => paso.dataset.fase)).toEqual(["hecho", "actual", "pendiente", "pendiente"]);
    expect(pasos[1]).toHaveAttribute("aria-current", "step");
    expect(pasos[1]).toHaveTextContent("En proceso");
  });

  it("una orden anulada no muestra el ciclo sino el aviso", () => {
    render(<CicloOrden estado="ANULADA" />);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByText(/anulada/i)).toBeInTheDocument();
  });
});
