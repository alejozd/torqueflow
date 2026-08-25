import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAddItemOrdenAction = vi.fn();
vi.mock("@/app/actions/item-orden-actions", () => ({
  addItemOrdenAction: (...args: unknown[]) => mockAddItemOrdenAction(...args),
}));

import { AgregarItemForm } from "./agregar-item-form";

const repuestos = [{ id: "r1", codigo: "FRN-001", nombre: "Filtro de aceite" }] as never;

describe("AgregarItemForm", () => {
  beforeEach(() => {
    mockAddItemOrdenAction.mockReset();
    mockAddItemOrdenAction.mockResolvedValue({ error: null, success: true });
  });

  it("renders the repuesto select alongside the manual fields", () => {
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} />);

    expect(screen.getByLabelText("Repuesto del inventario (opcional)")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Filtro de aceite/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Descripción")).toBeInTheDocument();
  });

  it("shows a success message after a successful submit with manual fields", async () => {
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} />);

    await userEvent.type(screen.getByLabelText("Descripción"), "Filtro de aceite");
    await userEvent.type(screen.getByLabelText("Cantidad"), "2");
    await userEvent.type(screen.getByLabelText("Precio unitario"), "15.5");
    await userEvent.click(screen.getByRole("button", { name: "Agregar ítem" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Ítem agregado");
  });

  it("blocks submission and shows the cross-field error when neither a repuesto nor manual descripcion+precio is given", async () => {
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} />);

    await userEvent.click(screen.getByRole("button", { name: "Agregar ítem" }));

    expect(
      await screen.findByText("Selecciona un repuesto del inventario o completa descripción y precio manualmente"),
    ).toBeInTheDocument();
    expect(mockAddItemOrdenAction).not.toHaveBeenCalled();
  });

  it("shows the server error when the action refuses an otherwise valid submission", async () => {
    mockAddItemOrdenAction.mockResolvedValue({ error: "El repuesto seleccionado no tiene stock suficiente.", success: false });
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} />);

    await userEvent.type(screen.getByLabelText("Descripción"), "Filtro de aceite");
    await userEvent.type(screen.getByLabelText("Cantidad"), "2");
    await userEvent.type(screen.getByLabelText("Precio unitario"), "15.5");
    await userEvent.click(screen.getByRole("button", { name: "Agregar ítem" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El repuesto seleccionado no tiene stock suficiente.");
  });
});
