import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAddEntradaItemAction = vi.fn();
vi.mock("@/app/actions/entrada-mercancia-actions", () => ({
  addEntradaItemAction: (...args: unknown[]) => mockAddEntradaItemAction(...args),
}));

import { AgregarEntradaItemForm } from "./agregar-entrada-item-form";

const repuestos = [{ id: "r1", codigo: "FRN-001", nombre: "Filtro de aceite" }] as never;

describe("AgregarEntradaItemForm", () => {
  beforeEach(() => {
    mockAddEntradaItemAction.mockReset();
    mockAddEntradaItemAction.mockResolvedValue({ error: null, success: true });
  });

  it("renders the repuesto select, cantidad, and precio fields", () => {
    render(<AgregarEntradaItemForm entradaId="e1" repuestos={repuestos} />);

    expect(screen.getByLabelText("Repuesto")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Filtro de aceite/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Cantidad")).toBeInTheDocument();
    expect(screen.getByLabelText("Precio de compra unitario")).toBeInTheDocument();
  });

  it("shows a success message after a successful submit", async () => {
    render(<AgregarEntradaItemForm entradaId="e1" repuestos={repuestos} />);

    await userEvent.click(screen.getByRole("button", { name: "Registrar ítem" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Ítem registrado, stock actualizado");
  });

  it("shows the error message when the action returns one", async () => {
    mockAddEntradaItemAction.mockResolvedValue({ error: "La cantidad debe ser al menos 1", success: false });
    render(<AgregarEntradaItemForm entradaId="e1" repuestos={repuestos} />);

    await userEvent.click(screen.getByRole("button", { name: "Registrar ítem" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("La cantidad debe ser al menos 1");
  });
});
