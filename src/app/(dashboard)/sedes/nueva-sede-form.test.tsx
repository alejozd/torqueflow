import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Dialog } from "@/components/ui/dialog";

const mockCreateSedeAction = vi.fn();
vi.mock("@/app/actions/sede-actions", () => ({
  createSedeAction: (...args: unknown[]) => mockCreateSedeAction(...args),
}));

import { NuevaSedeForm } from "./nueva-sede-form";

// NuevaSedeForm renders a DialogClose-wrapped Cancel button that requires a
// Dialog ancestor (same as every dialog-only form in this app) -- render
// through a real Dialog instead of the bare component.
function renderInDialog(ui: Parameters<typeof render>[0]) {
  return render(<Dialog open>{ui}</Dialog>);
}

describe("NuevaSedeForm", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a nombre field, a direccion field and a submit button", () => {
    renderInDialog(<NuevaSedeForm />);

    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
    expect(screen.getByLabelText("Dirección")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear sede" })).toBeInTheDocument();
  });

  it("marks nombre as required and direccion as optional", () => {
    renderInDialog(<NuevaSedeForm />);

    expect(screen.getByLabelText("Nombre")).toBeRequired();
    expect(screen.getByLabelText("Dirección")).not.toBeRequired();
  });
});
