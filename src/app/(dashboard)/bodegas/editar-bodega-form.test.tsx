import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "@/components/ui/dialog";

const mockDelete = vi.fn();
vi.mock("@/app/actions/bodega-actions", () => ({
  updateBodegaAction: vi.fn(),
  deleteBodegaFormAction: (...args: unknown[]) => mockDelete(...args),
}));

import { EditarBodegaForm } from "./editar-bodega-form";

// Production always renders this form inside a Dialog (DialogClose needs its context).
function renderInDialog(ui: ReactNode) {
  return render(<Dialog open>{ui}</Dialog>);
}

describe("EditarBodegaForm — eliminar", () => {
  beforeEach(() => mockDelete.mockReset());

  it("asks before deleting and only then calls deleteBodegaFormAction", async () => {
    mockDelete.mockResolvedValue({ error: null, success: true });
    renderInDialog(<EditarBodegaForm bodega={{ id: "b1", nombre: "Principal" }} />);

    await userEvent.click(screen.getByRole("button", { name: /Eliminar Principal/ }));
    expect(mockDelete).not.toHaveBeenCalled();
    expect(screen.getByText("¿Eliminar la bodega Principal? No se puede deshacer.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));
    await vi.waitFor(() => expect(mockDelete).toHaveBeenCalledWith("b1", expect.anything()));
  });

  it("shows the refusal reason", async () => {
    mockDelete.mockResolvedValue({ error: "No se puede eliminar", success: false });
    renderInDialog(<EditarBodegaForm bodega={{ id: "b1", nombre: "Principal" }} />);

    await userEvent.click(screen.getByRole("button", { name: /Eliminar Principal/ }));
    await userEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se puede eliminar");
  });
});
