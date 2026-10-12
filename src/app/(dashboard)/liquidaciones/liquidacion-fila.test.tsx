import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAjustar = vi.fn();
const mockAnular = vi.fn();
vi.mock("@/app/actions/liquidacion-actions", () => ({
  actualizarAjusteLiquidacionAction: (...args: unknown[]) => mockAjustar(...args),
  anularLiquidacionAction: (...args: unknown[]) => mockAnular(...args),
  pagarLiquidacionAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import type { LiquidacionFila as FilaDatos } from "@/app/actions/liquidacion-actions";
import { Table, TableBody } from "@/components/ui/table";
import { LiquidacionFila, esquemaEnUnaLinea } from "./liquidacion-fila";

const base: FilaDatos = {
  usuarioId: "t1",
  nombre: "Ana",
  ordenes: 3,
  trabajos: 4,
  montoManoObra: 180000,
  montoPorTrabajo: 45000,
  tipo: "PORCENTAJE",
  porcentaje: 40,
  montoFijo: null,
  montoSugerido: 72000,
  solapada: false,
  documento: {
    id: "l1",
    estado: "PENDIENTE",
    frecuencia: "MENSUAL",
    ordenes: 3,
    trabajos: 4,
    montoManoObra: 180000,
    montoCalculado: 72000,
    ajuste: 0,
    motivoAjuste: null,
    total: 72000,
    pagadaAt: null,
    gastoId: null,
    motivoAnulacion: null,
    hayCambios: false,
  },
};

function renderFila(fila: FilaDatos) {
  return render(
    <Table>
      <TableBody>
        <LiquidacionFila fila={fila} etiquetaPeriodo="octubre de 2026" />
      </TableBody>
    </Table>,
  );
}

describe("esquemaEnUnaLinea", () => {
  it("describe el esquema vigente", () => {
    expect(esquemaEnUnaLinea(base)).toBe("40 % de la mano de obra");
    expect(esquemaEnUnaLinea({ ...base, tipo: null })).toBe("Sin esquema");
    expect(esquemaEnUnaLinea({ ...base, tipo: "FIJO", porcentaje: null, montoFijo: 1500000 })).toContain("Base fija de");
    expect(esquemaEnUnaLinea({ ...base, tipo: "MIXTO", porcentaje: 10, montoFijo: 800000 })).toContain("+ 10 %");
  });
});

describe("LiquidacionFila", () => {
  beforeEach(() => {
    mockAjustar.mockReset();
    mockAjustar.mockResolvedValue({ error: null, success: true });
    mockAnular.mockReset();
    mockAnular.mockResolvedValue({ error: null });
  });

  it("muestra las cifras del técnico y el estado del documento", () => {
    renderFila(base);

    const texto = screen.getByRole("row").textContent ?? "";
    expect(texto).toContain("Ana");
    expect(texto).toContain("4");
    expect(texto).toContain("Pendiente");
    expect(screen.getByRole("button", { name: "Pagar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajuste" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anular" })).toBeInTheDocument();
  });

  it("avisa del técnico sin esquema, de los cambios sin reflejar y del solapamiento", () => {
    renderFila({ ...base, tipo: null, solapada: true, documento: { ...base.documento!, hayCambios: true } });

    expect(screen.getByText("Sin esquema de pago")).toBeInTheDocument();
    // La columna del esquema sigue diciendo que no tiene.
    expect(screen.getByText("Sin esquema")).toBeInTheDocument();
    expect(screen.getByText("Cambios sin reflejar")).toBeInTheDocument();
    expect(screen.getByText("Ya liquidado en otro periodo")).toBeInTheDocument();
  });

  it("sin documento no ofrece acciones: primero hay que generar el periodo", () => {
    renderFila({ ...base, documento: null });

    expect(screen.getByText("Sin generar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pagar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anular" })).not.toBeInTheDocument();
  });

  it("guarda el ajuste con su motivo", async () => {
    renderFila(base);

    await userEvent.click(screen.getByRole("button", { name: "Ajuste" }));
    await userEvent.clear(screen.getByLabelText("Ajuste (puede ser negativo)"));
    await userEvent.type(screen.getByLabelText("Ajuste (puede ser negativo)"), "-3000");
    await userEvent.type(screen.getByLabelText("Motivo"), "Herramienta rota");
    await userEvent.click(screen.getByRole("button", { name: "Guardar ajuste" }));

    await waitFor(() => expect(mockAjustar).toHaveBeenCalledTimes(1));
    const [id, , formData] = mockAjustar.mock.calls[0] as [string, unknown, FormData];
    expect(id).toBe("l1");
    expect(formData.get("ajuste")).toBe("-3000");
    expect(formData.get("motivo")).toBe("Herramienta rota");
  });

  it("pide confirmación antes de anular y exige motivo", async () => {
    renderFila(base);

    await userEvent.click(screen.getByRole("button", { name: "Anular" }));
    await userEvent.type(screen.getByLabelText("Motivo de la anulación"), "Se pagó por fuera");
    await userEvent.click(screen.getByRole("button", { name: "Anular" }));

    await waitFor(() => expect(mockAnular).toHaveBeenCalledWith("l1", "Se pagó por fuera"));
  });

  it("una pagada solo se puede anular", () => {
    renderFila({ ...base, documento: { ...base.documento!, estado: "PAGADA" } });

    expect(screen.getByText("Pagada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pagar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ajuste" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anular" })).toBeInTheDocument();
  });

  it("una anulada no ofrece acciones y muestra el motivo", () => {
    renderFila({
      ...base,
      documento: { ...base.documento!, estado: "ANULADA", motivoAnulacion: "Se pagó por fuera" },
    });

    expect(screen.getByText("Anulada")).toBeInTheDocument();
    expect(screen.getByText(/Se pagó por fuera/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anular" })).not.toBeInTheDocument();
  });

  it("muestra el error de la action al ajustar", async () => {
    mockAjustar.mockResolvedValue({ error: "El ajuste no puede dejar el total en negativo", success: false });
    renderFila(base);

    await userEvent.click(screen.getByRole("button", { name: "Ajuste" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar ajuste" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El ajuste no puede dejar el total en negativo");
  });
});
