import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockToggle = vi.fn();
vi.mock("@/app/actions/gasto-recurrente-actions", () => ({
  toggleGastoRecurrenteActivoAction: (...a: unknown[]) => mockToggle(...a),
  crearGastoRecurrenteAction: vi.fn(async () => ({ error: null, success: true })),
  actualizarGastoRecurrenteAction: vi.fn(async () => ({ error: null, success: true })),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { PlantillasRecurrentesSection } from "./plantillas-recurrentes-section";

const base = { sedeId: "s1", sedeNombre: "Principal", categoriaId: "c1", categoriaNombre: "Arriendo", montoEstimado: 1500000, diaDelMes: 5, desde: "2026-08" };
const PLANTILLAS = [
  { ...base, id: "r1", descripcion: "Arriendo local", activo: true },
  { ...base, id: "r2", descripcion: "Internet", activo: false },
];
const CATS = [{ id: "c1", nombre: "Arriendo", activo: true, orden: 0 }];
const SEDES = [{ id: "s1", nombre: "Principal" }];

beforeEach(() => {
  vi.clearAllMocks();
  mockToggle.mockResolvedValue({ error: null });
});

describe("PlantillasRecurrentesSection", () => {
  it("lista plantillas con insignia Inactiva", () => {
    render(<PlantillasRecurrentesSection plantillas={PLANTILLAS} categorias={CATS} sedes={SEDES} sedeIdPorDefecto="s1" />);
    expect(screen.getByText("Arriendo local")).toBeTruthy();
    expect(screen.getByText("Internet")).toBeTruthy();
    expect(screen.getAllByText("Inactiva")).toHaveLength(1);
  });

  it("Desactivar llama al toggle", async () => {
    render(<PlantillasRecurrentesSection plantillas={PLANTILLAS} categorias={CATS} sedes={SEDES} sedeIdPorDefecto="s1" />);
    await userEvent.click(screen.getByRole("button", { name: "Desactivar" }));
    await waitFor(() => expect(mockToggle).toHaveBeenCalledWith("r1"));
  });
});
