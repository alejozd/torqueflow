import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "@/components/ui/dialog";

const mockDelete = vi.fn();
vi.mock("@/app/actions/proveedor-actions", () => ({
  updateProveedorAction: vi.fn(),
  deleteProveedorFormAction: (...args: unknown[]) => mockDelete(...args),
}));

import { EditarProveedorForm } from "./editar-proveedor-form";

// Production always renders this form inside a Dialog (DialogClose needs its context).
function renderInDialog(ui: ReactNode) {
  return render(<Dialog open>{ui}</Dialog>);
}

describe("EditarProveedorForm — eliminar", () => {
  beforeEach(() => mockDelete.mockReset());

  it("asks before deleting and only then calls deleteProveedorFormAction", async () => {
    mockDelete.mockResolvedValue({ error: null, success: true });
    renderInDialog(<EditarProveedorForm proveedor={{ id: "p1", nombre: "Autopartes SAS", documento: null, direccion: null, contacto: null, telefono: null, email: null, diasEntrega: 3 }} />);

    await userEvent.click(screen.getByRole("button", { name: /Eliminar Autopartes SAS/ }));
    expect(mockDelete).not.toHaveBeenCalled();
    expect(screen.getByText("¿Eliminar el proveedor Autopartes SAS? No se puede deshacer.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));
    await vi.waitFor(() => expect(mockDelete).toHaveBeenCalledWith("p1", expect.anything()));
  });

  it("shows the refusal reason", async () => {
    mockDelete.mockResolvedValue({ error: "No se puede eliminar", success: false });
    renderInDialog(<EditarProveedorForm proveedor={{ id: "p1", nombre: "Autopartes SAS", documento: null, direccion: null, contacto: null, telefono: null, email: null, diasEntrega: 3 }} />);

    await userEvent.click(screen.getByRole("button", { name: /Eliminar Autopartes SAS/ }));
    await userEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se puede eliminar");
  });
});
