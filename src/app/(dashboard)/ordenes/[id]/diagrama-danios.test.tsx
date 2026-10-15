import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAgregar = vi.fn();
const mockQuitar = vi.fn();
vi.mock("@/app/actions/recepcion-actions", () => ({
  agregarDanioAction: (...args: unknown[]) => mockAgregar(...args),
  quitarDanioAction: (...args: unknown[]) => mockQuitar(...args),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DiagramaDanios } from "./diagrama-danios";

const DANIOS = [
  { id: "d1", zona: "CAPO" as const, tipo: "GOLPE" as const, nota: "Leve" },
  { id: "d2", zona: "GUARDABARROS_TRASERO_DERECHO" as const, tipo: "RAYON" as const, nota: null },
];

function renderDiagrama(props: Partial<Parameters<typeof DiagramaDanios>[0]> = {}) {
  return render(
    <DiagramaDanios ordenId="o1" tipoVehiculo="CARRO" danios={[]} soloLectura={false} puedeQuitar {...props} />,
  );
}

describe("DiagramaDanios", () => {
  beforeEach(() => {
    mockAgregar.mockReset().mockResolvedValue({ error: null, success: true });
    mockQuitar.mockReset().mockResolvedValue({ error: null, success: true });
  });

  it("las zonas son opciones del dibujo y ninguna viene elegida", () => {
    renderDiagrama();
    const zonas = within(screen.getByRole("radiogroup", { name: /Zonas del vehículo/ })).getAllByRole("radio");
    expect(zonas.length).toBeGreaterThan(10);
    expect(zonas.every((zona) => zona.getAttribute("aria-checked") === "false")).toBe(true);
    expect(screen.queryByRole("button", { name: "Marcar daño" })).not.toBeInTheDocument();
  });

  it("al tocar una zona se abre el formulario y envía zona, tipo y nota", async () => {
    renderDiagrama();
    await userEvent.click(screen.getByRole("radio", { name: /^Capó/ }));
    expect(screen.getByRole("radio", { name: /^Capó/ })).toHaveAttribute("aria-checked", "true");
    const formulario = screen.getByRole("form", { name: "Nuevo daño en capó" });
    await userEvent.click(within(formulario).getByRole("radio", { name: "Rayón" }));
    await userEvent.type(within(formulario).getByRole("textbox", { name: /Nota/ }), "10 cm");
    await userEvent.click(within(formulario).getByRole("button", { name: "Marcar daño" }));
    const datos = mockAgregar.mock.calls[0]![2] as FormData;
    expect([datos.get("zona"), datos.get("tipo"), datos.get("nota")]).toEqual(["CAPO", "RAYON", "10 cm"]);
  });

  it("cancelar cierra el formulario sin marcar", async () => {
    renderDiagrama();
    await userEvent.click(screen.getByRole("radio", { name: /^Capó/ }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(mockAgregar).not.toHaveBeenCalled();
  });

  it("con las flechas se pasa de una zona a otra", async () => {
    renderDiagrama();
    screen.getByRole("radio", { name: /^Frente/ }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: /^Capó/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /^Capó/ })).toHaveFocus();
  });

  it("cada daño lleva un número en el dibujo y la misma tarjeta a la derecha", () => {
    const { container } = renderDiagrama({ danios: DANIOS });
    const tarjetas = within(screen.getByRole("list", { name: "Daños marcados" })).getAllByRole("listitem");
    expect(tarjetas[0]).toHaveTextContent("1");
    expect(tarjetas[0]).toHaveTextContent("Capó");
    expect(tarjetas[0]).toHaveTextContent("Golpe");
    expect(tarjetas[0]).toHaveTextContent("Leve");
    expect(tarjetas[1]).toHaveTextContent("Guardabarros trasero derecho");
    expect(container.querySelectorAll("[data-marcador]")).toHaveLength(2);
  });

  it("pasar el mouse por una tarjeta resalta su número en el dibujo", async () => {
    const { container } = renderDiagrama({ danios: DANIOS });
    const tarjetas = within(screen.getByRole("list", { name: "Daños marcados" })).getAllByRole("listitem");
    await userEvent.hover(tarjetas[1]!);
    expect(container.querySelector('[data-marcador="2"]')).toHaveAttribute("data-activo", "true");
    expect(container.querySelector('[data-marcador="1"]')).not.toHaveAttribute("data-activo");
  });

  it("un lateral viejo en un carro se lista con su aviso y su número va fuera del dibujo", () => {
    const { container } = renderDiagrama({
      danios: [{ id: "v1", zona: "LATERAL_IZQUIERDO", tipo: "GOLPE", nota: "hundimiento" }],
    });
    expect(screen.getByText(/antes de separar los guardabarros/)).toBeInTheDocument();
    expect(container.querySelector('[data-marcador="1"]')).not.toBeNull();
  });

  it("«Otra zona» abre el formulario para lo que no está en el dibujo", async () => {
    renderDiagrama();
    await userEvent.click(screen.getByRole("button", { name: /Otra zona/ }));
    const formulario = screen.getByRole("form", { name: "Nuevo daño en otra zona" });
    await userEvent.click(within(formulario).getByRole("button", { name: "Marcar daño" }));
    expect((mockAgregar.mock.calls[0]![2] as FormData).get("zona")).toBe("OTRO");
  });

  it("la moto se dibuja de lado con sus zonas", () => {
    renderDiagrama({ tipoVehiculo: "MOTO" });
    expect(screen.getByRole("radio", { name: /^Manubrio/ })).toBeInTheDocument();
    expect(screen.getByText("◀ Adelante")).toBeInTheDocument();
  });

  it("en solo lectura no deja marcar ni quitar", async () => {
    renderDiagrama({ danios: DANIOS, soloLectura: true });
    await userEvent.click(screen.getByRole("radio", { name: /^Capó/ }));
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Quitar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Otra zona/ })).not.toBeInTheDocument();
  });

  it("sin marcas lo dice", () => {
    renderDiagrama();
    expect(screen.getByText("Sin daños marcados.")).toBeInTheDocument();
  });

  it("muestra el error de la acción", async () => {
    mockAgregar.mockResolvedValue({ error: "Esa zona ya está marcada con ese mismo daño", success: false });
    renderDiagrama();
    await userEvent.click(screen.getByRole("radio", { name: /^Capó/ }));
    await userEvent.click(screen.getByRole("button", { name: "Marcar daño" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ya está marcada");
  });
});
