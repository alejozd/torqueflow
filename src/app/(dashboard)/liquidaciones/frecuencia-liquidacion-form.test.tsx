import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockGuardar = vi.fn();
vi.mock("@/app/actions/liquidacion-actions", () => ({
  guardarFrecuenciaLiquidacionAction: (...args: unknown[]) => mockGuardar(...args),
  guardarEsquemaLiquidacionAction: vi.fn(),
  listTecnicosConEsquema: vi.fn(),
  getFrecuenciaLiquidacion: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { FrecuenciaLiquidacionForm } from "./frecuencia-liquidacion-form";

describe("FrecuenciaLiquidacionForm", () => {
  beforeEach(() => {
    mockGuardar.mockReset();
    mockGuardar.mockResolvedValue({ error: null, success: true });
  });

  it("muestra las tres frecuencias en español", async () => {
    render(<FrecuenciaLiquidacionForm frecuencia="MENSUAL" />);

    await userEvent.click(screen.getByRole("combobox", { name: "Cada cuánto se liquida" }));

    expect(await screen.findByRole("option", { name: /Semanal/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Quincenal/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Mensual" })).toBeInTheDocument();
  });

  it("guarda la frecuencia elegida", async () => {
    render(<FrecuenciaLiquidacionForm frecuencia="MENSUAL" />);

    await userEvent.click(screen.getByRole("combobox", { name: "Cada cuánto se liquida" }));
    await userEvent.click(await screen.findByRole("option", { name: /Quincenal/ }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar frecuencia" }));

    await waitFor(() => expect(mockGuardar).toHaveBeenCalledTimes(1));
    const [, formData] = mockGuardar.mock.calls[0] as [unknown, FormData];
    expect(formData.get("frecuencia")).toBe("QUINCENAL");
  });

  it("muestra el error de la action", async () => {
    mockGuardar.mockResolvedValue({ error: "Frecuencia inválida", success: false });
    render(<FrecuenciaLiquidacionForm frecuencia="MENSUAL" />);

    await userEvent.click(screen.getByRole("button", { name: "Guardar frecuencia" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Frecuencia inválida");
  });
});
