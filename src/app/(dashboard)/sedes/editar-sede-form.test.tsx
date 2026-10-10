import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "@/components/ui/dialog";
import type { Sede } from "@/generated/prisma-tenant";

const mockDelete = vi.fn();
vi.mock("@/app/actions/sede-actions", () => ({
  updateSedeAction: vi.fn(),
  deleteSedeFormAction: (...args: unknown[]) => mockDelete(...args),
}));

import { EditarSedeForm } from "./editar-sede-form";

// Production always renders this form inside a Dialog (DialogClose needs its context).
function renderInDialog(ui: ReactNode) {
  return render(<Dialog open>{ui}</Dialog>);
}

describe("EditarSedeForm — eliminar", () => {
  beforeEach(() => mockDelete.mockReset());

  it("asks before deleting and only then calls deleteSedeFormAction", async () => {
    mockDelete.mockResolvedValue({ error: null, success: true });
    renderInDialog(<EditarSedeForm sede={{ id: "s1", nombre: "Norte", direccion: null } as Sede} />);

    await userEvent.click(screen.getByRole("button", { name: /Eliminar Norte/ }));
    expect(mockDelete).not.toHaveBeenCalled();
    expect(screen.getByText("¿Eliminar la sede Norte? No se puede deshacer.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));
    await vi.waitFor(() => expect(mockDelete).toHaveBeenCalledWith("s1", expect.anything()));
  });

  it("shows the refusal reason", async () => {
    mockDelete.mockResolvedValue({ error: "No se puede eliminar", success: false });
    renderInDialog(<EditarSedeForm sede={{ id: "s1", nombre: "Norte", direccion: null } as Sede} />);

    await userEvent.click(screen.getByRole("button", { name: /Eliminar Norte/ }));
    await userEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se puede eliminar");
  });
});
