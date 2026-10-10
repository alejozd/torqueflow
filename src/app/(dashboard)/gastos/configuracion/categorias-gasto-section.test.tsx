import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockToggle = vi.fn();
const mockCrear = vi.fn();
vi.mock("@/app/actions/categoria-gasto-actions", () => ({
  toggleCategoriaGastoActivaAction: (...a: unknown[]) => mockToggle(...a),
  crearCategoriaGastoAction: (...a: unknown[]) => mockCrear(...a),
  renombrarCategoriaGastoAction: vi.fn(async () => ({ error: null, success: true })),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { CategoriasGastoSection } from "./categorias-gasto-section";

const CATS = [
  { id: "c1", nombre: "Arriendo", activo: true, orden: 0 },
  { id: "c2", nombre: "Servicios", activo: false, orden: 1 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockToggle.mockResolvedValue({ error: null });
  mockCrear.mockResolvedValue({ error: null, success: true });
});

describe("CategoriasGastoSection", () => {
  it("renderiza categorías con insignia Inactiva", () => {
    render(<CategoriasGastoSection categorias={CATS} />);
    expect(screen.getByText("Arriendo")).toBeTruthy();
    expect(screen.getByText("Servicios")).toBeTruthy();
    expect(screen.getAllByText("Inactiva")).toHaveLength(1);
  });

  it("Desactivar llama al toggle", async () => {
    render(<CategoriasGastoSection categorias={CATS} />);
    await userEvent.click(screen.getByRole("button", { name: /Desactivar/ }));
    await waitFor(() => expect(mockToggle).toHaveBeenCalledWith("c1"));
  });

  it("Nueva categoría llama a crear", async () => {
    render(<CategoriasGastoSection categorias={CATS} />);
    await userEvent.type(screen.getByLabelText("Nueva categoría"), "Papelería");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));
    await waitFor(() => expect(mockCrear).toHaveBeenCalled());
  });
});
