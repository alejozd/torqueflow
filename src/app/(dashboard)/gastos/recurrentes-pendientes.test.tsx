import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockOmitir = vi.fn();
vi.mock("@/app/actions/gasto-recurrente-actions", () => ({
  confirmarRecurrenteAction: vi.fn(async () => ({ error: null, success: true })),
  omitirRecurrenteAction: (...a: unknown[]) => mockOmitir(...a),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { RecurrentesPendientes } from "./recurrentes-pendientes";

const PENDIENTES = [
  {
    recurrenteId: "r1",
    descripcion: "Arriendo",
    categoriaNombre: "Arriendo",
    periodo: "2026-10",
    fechaSugerida: new Date("2026-10-05T00:00:00.000Z"),
    montoEstimado: 1500000,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockOmitir.mockResolvedValue({ error: null });
});

describe("RecurrentesPendientes", () => {
  it("ADMIN ve Confirmar y Omitir", () => {
    render(<RecurrentesPendientes pendientes={PENDIENTES} esAdmin />);
    expect(screen.getByText("Gastos recurrentes por confirmar")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Omitir este mes" })).toBeTruthy();
  });

  it("RECEPCION ve el texto y ningún botón", () => {
    render(<RecurrentesPendientes pendientes={PENDIENTES} esAdmin={false} />);
    expect(screen.getByText("El administrador debe confirmarlo")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("Omitir pide confirmación antes de llamar la action", async () => {
    render(<RecurrentesPendientes pendientes={PENDIENTES} esAdmin />);
    await userEvent.click(screen.getByRole("button", { name: "Omitir este mes" }));
    expect(mockOmitir).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Sí, omitir" }));
    await waitFor(() => expect(mockOmitir).toHaveBeenCalledWith("r1", "2026-10"));
  });

  it("sin pendientes no renderiza nada", () => {
    const { container } = render(<RecurrentesPendientes pendientes={[]} esAdmin />);
    expect(container.firstChild).toBeNull();
  });
});
