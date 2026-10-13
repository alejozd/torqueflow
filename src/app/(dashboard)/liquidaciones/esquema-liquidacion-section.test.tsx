import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockGuardar = vi.fn();
const mockQuitar = vi.fn();
vi.mock("@/app/actions/liquidacion-actions", () => ({
  guardarEsquemaLiquidacionAction: (...args: unknown[]) => mockGuardar(...args),
  quitarEsquemaLiquidacionAction: (...args: unknown[]) => mockQuitar(...args),
  guardarFrecuenciaLiquidacionAction: vi.fn(),
  getFrecuenciaLiquidacion: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import type { TecnicoConEsquema } from "@/app/actions/liquidacion-actions";
import { EsquemaLiquidacionSection, descripcionEsquema } from "./esquema-liquidacion-section";

const tecnicos: TecnicoConEsquema[] = [
  { usuarioId: "t1", nombre: "Ana", tipo: "PORCENTAJE", porcentaje: 40, montoFijo: null },
  { usuarioId: "t2", nombre: "Beto", tipo: "MIXTO", porcentaje: 12.5, montoFijo: 800000 },
  { usuarioId: "t3", nombre: "Carla", tipo: null, porcentaje: null, montoFijo: null },
];

describe("descripcionEsquema", () => {
  it("describe cada tipo de esquema y el que no tiene", () => {
    expect(descripcionEsquema(tecnicos[0]!)).toBe("40 % de la mano de obra");
    expect(descripcionEsquema(tecnicos[1]!)).toContain("12,5 % de la mano de obra");
    expect(descripcionEsquema(tecnicos[1]!)).toContain("Base de");
    expect(descripcionEsquema(tecnicos[2]!)).toBe("Sin esquema (no se liquida)");
  });
});

describe("EsquemaLiquidacionSection", () => {
  beforeEach(() => {
    mockGuardar.mockReset();
    mockGuardar.mockResolvedValue({ error: null, success: true });
    mockQuitar.mockReset();
    mockQuitar.mockResolvedValue({ error: null });
  });

  it("lista a los técnicos de la sede con su forma de pago", () => {
    render(<EsquemaLiquidacionSection tecnicos={tecnicos} />);

    const filas = screen.getAllByRole("listitem");
    expect(filas).toHaveLength(3);
    expect(filas[0]!.textContent).toContain("Ana");
    expect(filas[0]!.textContent).toContain("40 % de la mano de obra");
    expect(filas[2]!.textContent).toContain("Sin esquema (no se liquida)");
    expect(within(filas[2]!).getByRole("button", { name: "Definir esquema" })).toBeInTheDocument();
  });

  it("avisa cuando la sede no tiene técnicos", () => {
    render(<EsquemaLiquidacionSection tecnicos={[]} />);

    expect(screen.getByText(/Esta sede no tiene técnicos/)).toBeInTheDocument();
  });

  it("guarda el esquema elegido con su tipo y su monto", async () => {
    render(<EsquemaLiquidacionSection tecnicos={tecnicos} />);

    await userEvent.click(screen.getAllByRole("button", { name: "Editar" })[0]!);
    await userEvent.click(screen.getByRole("combobox", { name: "Tipo" }));
    await userEvent.click(await screen.findByRole("option", { name: "Base fija + porcentaje" }));
    await userEvent.clear(screen.getByLabelText("Porcentaje de la mano de obra"));
    await userEvent.type(screen.getByLabelText("Porcentaje de la mano de obra"), "10");
    await userEvent.type(screen.getByLabelText("Base por periodo"), "500000");
    await userEvent.click(screen.getByRole("button", { name: "Guardar esquema" }));

    await waitFor(() => expect(mockGuardar).toHaveBeenCalledTimes(1));
    const [usuarioId, , formData] = mockGuardar.mock.calls[0] as [string, unknown, FormData];
    expect(usuarioId).toBe("t1");
    expect(formData.get("tipo")).toBe("MIXTO");
    expect(formData.get("porcentaje")).toBe("10");
    expect(formData.get("montoFijo")).toBe("500000");
    // El formulario se cierra tras guardar.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Guardar esquema" })).not.toBeInTheDocument());
  });

  it("oculta el monto base cuando el tipo es solo porcentaje", async () => {
    render(<EsquemaLiquidacionSection tecnicos={tecnicos} />);

    await userEvent.click(screen.getAllByRole("button", { name: "Editar" })[0]!);

    expect(screen.getByLabelText("Porcentaje de la mano de obra")).toBeInTheDocument();
    expect(screen.queryByLabelText("Base por periodo")).not.toBeInTheDocument();
  });

  it("muestra el error de la action sin cerrar el formulario", async () => {
    mockGuardar.mockResolvedValue({ error: "Un esquema mixto necesita el porcentaje y el monto base", success: false });
    render(<EsquemaLiquidacionSection tecnicos={tecnicos} />);

    await userEvent.click(screen.getAllByRole("button", { name: "Editar" })[0]!);
    await userEvent.click(screen.getByRole("button", { name: "Guardar esquema" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Un esquema mixto necesita el porcentaje y el monto base");
    expect(screen.getByRole("button", { name: "Guardar esquema" })).toBeInTheDocument();
  });

  it("quita el esquema tras confirmar", async () => {
    render(<EsquemaLiquidacionSection tecnicos={tecnicos} />);

    await userEvent.click(screen.getAllByRole("button", { name: "Quitar esquema" })[0]!);
    expect(screen.getByText("¿Dejar a este técnico sin esquema?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Quitar" }));

    await waitFor(() => expect(mockQuitar).toHaveBeenCalledWith("t1"));
  });

  it("no ofrece quitar el esquema a quien no lo tiene", () => {
    render(<EsquemaLiquidacionSection tecnicos={[tecnicos[2]!]} />);

    expect(screen.queryByRole("button", { name: "Quitar esquema" })).not.toBeInTheDocument();
  });
});
