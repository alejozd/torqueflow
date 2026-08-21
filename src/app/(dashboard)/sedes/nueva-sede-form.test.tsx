import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const mockCreateSedeAction = vi.fn();
vi.mock("@/app/actions/sede-actions", () => ({
  createSedeAction: (...args: unknown[]) => mockCreateSedeAction(...args),
}));

import { NuevaSedeForm } from "./nueva-sede-form";

describe("NuevaSedeForm", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a nombre field, a direccion field and a submit button", () => {
    render(<NuevaSedeForm />);

    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
    expect(screen.getByLabelText("Dirección")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear sede" })).toBeInTheDocument();
  });

  it("marks nombre as required and direccion as optional", () => {
    render(<NuevaSedeForm />);

    expect(screen.getByLabelText("Nombre")).toBeRequired();
    expect(screen.getByLabelText("Dirección")).not.toBeRequired();
  });
});
