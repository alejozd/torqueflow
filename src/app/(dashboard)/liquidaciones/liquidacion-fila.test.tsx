import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAnular = vi.fn();
vi.mock("@/app/actions/liquidacion-actions", () => ({
  anularLiquidacionAction: (...args: unknown[]) => mockAnular(...args),
  pagarLiquidacionAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import type { LiquidacionFila as FilaDatos } from "@/app/actions/liquidacion-actions";
import { Table, TableBody } from "@/components/ui/table";
import { LiquidacionFila, esquemaEnUnaLinea } from "./liquidacion-fila";

const porPagar: FilaDatos = {
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
  pago: null,
};

const pagada: FilaDatos = {
  ...porPagar,
  pago: {
    id: "l1",
    montoCalculado: 72000,
    ajuste: -2000,
    motivoAjuste: "Adelanto",
    total: 70000,
    pagadaAt: new Date("2026-10-31T15:00:00.000Z"),
  },
};

function renderFila(fila: FilaDatos) {
  return render(
    <Table>
      <TableBody>
        <LiquidacionFila fila={fila} periodo="2026-10" etiquetaPeriodo="octubre de 2026" />
      </TableBody>
    </Table>,
  );
}

describe("esquemaEnUnaLinea", () => {
  it("describe el esquema vigente", () => {
    expect(esquemaEnUnaLinea(porPagar)).toBe("40 % de la mano de obra");
    expect(esquemaEnUnaLinea({ ...porPagar, tipo: null })).toBe("Sin esquema");
    expect(esquemaEnUnaLinea({ ...porPagar, tipo: "FIJO", porcentaje: null, montoFijo: 1500000 })).toContain("Base fija de");
    expect(esquemaEnUnaLinea({ ...porPagar, tipo: "MIXTO", porcentaje: 10, montoFijo: 800000 })).toContain("+ 10 %");
  });
});

describe("LiquidacionFila", () => {
  beforeEach(() => {
    mockAnular.mockReset();
    mockAnular.mockResolvedValue({ error: null });
  });

  it("por pagar: muestra las cifras del técnico, lo que le corresponde y el botón de pagar", () => {
    renderFila(porPagar);

    const celdas = within(screen.getAllByRole("row")[0]!).getAllByRole("cell");
    expect(celdas[0]!.textContent).toContain("Ana");
    expect(celdas[2]!.textContent).toBe("4"); // Trabajos, no el "40 %" del esquema
    expect(celdas[5]!.textContent).toContain("40 % de la mano de obra");
    expect(celdas[6]!.textContent).toMatch(/72\.000/);
    expect(screen.getByText("Por pagar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pagar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anular" })).not.toBeInTheDocument();
  });

  it("pagada: muestra lo pagado con su ajuste y solo ofrece anular", () => {
    renderFila(pagada);

    const celdas = within(screen.getAllByRole("row")[0]!).getAllByRole("cell");
    expect(celdas[6]!.textContent).toMatch(/70\.000/);
    expect(celdas[6]!.textContent).toContain("Adelanto");
    expect(screen.getByText("Pagada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pagar" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anular" })).toBeInTheDocument();
  });

  it("sin esquema o ya pagado en otro periodo no se puede pagar", () => {
    const { unmount } = renderFila({ ...porPagar, tipo: null, montoSugerido: null });
    expect(screen.getByText("Sin esquema de pago")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pagar" })).not.toBeInTheDocument();
    unmount();

    renderFila({ ...porPagar, solapada: true });
    expect(screen.getByText("Ya pagado en otro periodo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pagar" })).not.toBeInTheDocument();
  });

  it("pide confirmación antes de anular y llama la action con el motivo", async () => {
    renderFila(pagada);

    await userEvent.click(screen.getByRole("button", { name: "Anular" }));
    expect(screen.getByText("¿Anular el pago y borrar su gasto?")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Motivo de la anulación"), "Se pagó por fuera");
    await userEvent.click(screen.getByRole("button", { name: "Anular" }));

    await waitFor(() => expect(mockAnular).toHaveBeenCalledWith("l1", "Se pagó por fuera"));
  });

  it("muestra el error de la action al anular", async () => {
    mockAnular.mockResolvedValue({ error: "Explica por qué se anula la liquidación" });
    renderFila(pagada);

    await userEvent.click(screen.getByRole("button", { name: "Anular" }));
    await userEvent.click(screen.getByRole("button", { name: "Anular" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Explica por qué se anula la liquidación");
  });
});
