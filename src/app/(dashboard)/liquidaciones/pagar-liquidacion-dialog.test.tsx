import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPagar = vi.fn();
vi.mock("@/app/actions/liquidacion-actions", () => ({
  pagarLiquidacionAction: (...args: unknown[]) => mockPagar(...args),
  anularLiquidacionAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PagarLiquidacionDialog } from "./pagar-liquidacion-dialog";

function renderizar() {
  render(
    <PagarLiquidacionDialog usuarioId="t1" nombre="Ana" periodo="2026-10" etiquetaPeriodo="octubre de 2026" calculado={72000} />,
  );
}

async function abrir() {
  await userEvent.click(screen.getByRole("button", { name: "Pagar" }));
  await screen.findByRole("heading", { name: "Pagar liquidación de Ana" });
}

describe("PagarLiquidacionDialog", () => {
  beforeEach(() => {
    mockPagar.mockReset();
    mockPagar.mockResolvedValue({ error: null, success: true });
  });

  it("abre el diálogo con el periodo y el monto calculado", async () => {
    renderizar();
    await abrir();

    expect(screen.getByText(/octubre de 2026/)).toBeInTheDocument();
    expect(screen.getByText("Calculado")).toBeInTheDocument();
    expect(screen.getByTestId("total-a-pagar")).toHaveTextContent(/72\.000/);
  });

  it("paga en efectivo, sin ajuste y con la fecha de hoy por defecto", async () => {
    renderizar();
    await abrir();
    await userEvent.click(screen.getByRole("button", { name: "Pagar liquidación" }));

    await waitFor(() => expect(mockPagar).toHaveBeenCalledTimes(1));
    const [usuarioId, periodo, , formData] = mockPagar.mock.calls[0] as [string, string, unknown, FormData];
    expect(usuarioId).toBe("t1");
    expect(periodo).toBe("2026-10");
    expect(formData.get("metodoPago")).toBe("EFECTIVO");
    expect(formData.get("fecha")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(formData.get("referencia")).toBe("");
    expect(formData.get("ajuste")).toBe("");
    expect(formData.get("motivoAjuste")).toBe("");
  });

  it("el ajuste se suma al total que se muestra y viaja con su motivo", async () => {
    renderizar();
    await abrir();
    await userEvent.type(screen.getByLabelText("Ajuste (opcional, puede ser negativo)"), "-2000");
    await userEvent.type(screen.getByLabelText("Motivo del ajuste"), "Adelanto");

    expect(screen.getByTestId("total-a-pagar")).toHaveTextContent(/70\.000/);

    await userEvent.click(screen.getByRole("button", { name: "Pagar liquidación" }));
    await waitFor(() => expect(mockPagar).toHaveBeenCalledTimes(1));
    const formData = mockPagar.mock.calls[0]![3] as FormData;
    expect(formData.get("ajuste")).toBe("-2000");
    expect(formData.get("motivoAjuste")).toBe("Adelanto");
  });

  it("permite elegir otro método y escribir una referencia", async () => {
    renderizar();
    await abrir();
    await userEvent.click(screen.getByRole("combobox", { name: "Método de pago" }));
    await userEvent.click(await screen.findByRole("option", { name: "Transferencia" }));
    await userEvent.type(screen.getByLabelText("Referencia (opcional)"), "TRF-99");
    await userEvent.click(screen.getByRole("button", { name: "Pagar liquidación" }));

    await waitFor(() => expect(mockPagar).toHaveBeenCalledTimes(1));
    const formData = mockPagar.mock.calls[0]![3] as FormData;
    expect(formData.get("metodoPago")).toBe("TRANSFERENCIA");
    expect(formData.get("referencia")).toBe("TRF-99");
  });

  it("muestra el error de la action (por ejemplo, ya está pagada)", async () => {
    mockPagar.mockResolvedValue({ error: "Esa liquidación ya está pagada", success: false });
    renderizar();
    await abrir();
    await userEvent.click(screen.getByRole("button", { name: "Pagar liquidación" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Esa liquidación ya está pagada");
  });
});
