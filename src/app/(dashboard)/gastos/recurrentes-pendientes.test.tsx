import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockOmitir = vi.fn();
const mockConfirmar = vi.fn();
vi.mock("@/app/actions/gasto-recurrente-actions", () => ({
  confirmarRecurrenteAction: (...a: unknown[]) => mockConfirmar(...a),
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
  mockConfirmar.mockResolvedValue({ error: null, success: true });
});

describe("RecurrentesPendientes", () => {
  it("ADMIN ve Confirmar y Omitir", () => {
    render(<RecurrentesPendientes pendientes={PENDIENTES} puedeAdministrar />);
    expect(screen.getByText("Gastos recurrentes por confirmar")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Omitir este mes" })).toBeTruthy();
  });

  it("RECEPCION ve el texto y ningún botón", () => {
    render(<RecurrentesPendientes pendientes={PENDIENTES} puedeAdministrar={false} />);
    expect(screen.getByText("El administrador debe confirmarlo")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("Omitir pide confirmación antes de llamar la action", async () => {
    render(<RecurrentesPendientes pendientes={PENDIENTES} puedeAdministrar />);
    await userEvent.click(screen.getByRole("button", { name: "Omitir este mes" }));
    expect(mockOmitir).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Sí, omitir" }));
    await waitFor(() => expect(mockOmitir).toHaveBeenCalledWith("r1", "2026-10"));
  });

  it("Confirmar envía la fecha sugerida sin correr el día (medianoche UTC)", async () => {
    render(<RecurrentesPendientes pendientes={PENDIENTES} puedeAdministrar />);
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar gasto" }));
    await waitFor(() => expect(mockConfirmar).toHaveBeenCalled());
    const formData = mockConfirmar.mock.calls[0][3] as FormData;
    expect(formData.get("fecha")).toBe("2026-10-05");
  });

  it("sin pendientes no renderiza nada", () => {
    const { container } = render(<RecurrentesPendientes pendientes={[]} puedeAdministrar />);
    expect(container.firstChild).toBeNull();
  });
});
