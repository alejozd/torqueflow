import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUpdateEstado = vi.fn();
vi.mock("@/app/actions/orden-actions", () => ({
  updateEstadoOrdenAction: (...args: unknown[]) => mockUpdateEstado(...args),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

import { TableroOrdenes, type ColumnaTablero, type TarjetaTablero } from "./tablero-ordenes";

function tarjeta(cambios: Partial<TarjetaTablero> = {}): TarjetaTablero {
  return {
    id: "o1",
    estado: "EN_PROCESO",
    prioridad: "NORMAL",
    placa: "ABC123",
    sintomas: "Ruido",
    cliente: "Ana",
    mecanico: "Luis",
    total: 250000,
    movible: true,
    alertaDias: null,
    alertaMotivo: null,
    ...cambios,
  };
}

function columnas(...ordenes: TarjetaTablero[]): ColumnaTablero[] {
  return [
    { estado: "BORRADOR", ordenes: ordenes.filter((item) => item.estado === "BORRADOR") },
    { estado: "EN_PROCESO", ordenes: ordenes.filter((item) => item.estado === "EN_PROCESO") },
    { estado: "TERMINADA", ordenes: ordenes.filter((item) => item.estado === "TERMINADA") },
    { estado: "ENTREGADA", ordenes: ordenes.filter((item) => item.estado === "ENTREGADA") },
  ];
}

describe("TableroOrdenes", () => {
  beforeEach(() => {
    mockUpdateEstado.mockReset().mockResolvedValue({ error: null, advertencia: null });
    mockPush.mockReset();
  });

  it("un clic en cualquier parte de la tarjeta abre la orden", async () => {
    render(<TableroOrdenes columnas={columnas(tarjeta())} />);

    await userEvent.click(screen.getByText("Ana", { exact: false }));

    expect(mockPush).toHaveBeenCalledWith("/ordenes/o1");
  });

  it("abrir el menú o elegir en él no abre la orden", async () => {
    render(<TableroOrdenes columnas={columnas(tarjeta())} />);

    await userEvent.click(screen.getByRole("button", { name: "Mover la orden ABC123" }));
    await userEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Terminada" }));

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("pinta las columnas con su conteo y las tarjetas", () => {
    render(<TableroOrdenes columnas={columnas(tarjeta(), tarjeta({ id: "o2", placa: "XYZ789", estado: "TERMINADA" }))} />);

    expect(screen.getByText("En proceso")).toBeInTheDocument();
    expect(screen.getByText("Terminada")).toBeInTheDocument();
    expect(screen.getByText("ABC123")).toBeInTheDocument();
    expect(screen.getByText("XYZ789")).toBeInTheDocument();
    expect(within(screen.getByText("Borrador").closest("[data-columna]")!).getByText("Sin órdenes")).toBeInTheDocument();
  });

  it("marca las órdenes con alerta y su prioridad", () => {
    render(
      <TableroOrdenes
        columnas={columnas(tarjeta({ prioridad: "URGENTE", alertaDias: 6, alertaMotivo: "ESTANCADA" }))}
      />,
    );

    expect(screen.getByText("Urgente")).toBeInTheDocument();
    expect(screen.getByText("6 días sin actividad")).toBeInTheDocument();
  });

  it("ofrece el menú de mover con la prioridad y la alerta visibles", () => {
    render(<TableroOrdenes columnas={columnas(tarjeta())} />);

    expect(screen.getByRole("button", { name: "Mover la orden ABC123" })).toBeInTheDocument();
  });

  it("al abrir el menú muestra 'Mover a…' con los destinos y anular (antes rompía la página)", async () => {
    // Base UI exige que el título del menú vaya dentro de un grupo: suelto, abrir
    // el menú lanzaba "MenuGroupContext is missing" y la página quedaba en negro.
    render(<TableroOrdenes columnas={columnas(tarjeta())} />);

    await userEvent.click(screen.getByRole("button", { name: "Mover la orden ABC123" }));

    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("Mover a…")).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Terminada" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Anular" })).toBeInTheDocument();
  });

  it("elegir un destino en el menú mueve la orden", async () => {
    render(<TableroOrdenes columnas={columnas(tarjeta())} />);

    await userEvent.click(screen.getByRole("button", { name: "Mover la orden ABC123" }));
    await userEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Terminada" }));

    await waitFor(() => expect(mockUpdateEstado).toHaveBeenCalledTimes(1));
    expect(mockUpdateEstado.mock.calls[0]![0]).toBe("o1");
    expect((mockUpdateEstado.mock.calls[0]![2] as FormData).get("estado")).toBe("TERMINADA");
  });

  it("anular desde el menú pide confirmación antes de anular", async () => {
    render(<TableroOrdenes columnas={columnas(tarjeta())} />);

    await userEvent.click(screen.getByRole("button", { name: "Mover la orden ABC123" }));
    await userEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Anular" }));

    expect(await screen.findByText(/¿Anular la orden ABC123\?/)).toBeInTheDocument();
    expect(mockUpdateEstado).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Sí, anular" }));
    await waitFor(() => expect((mockUpdateEstado.mock.calls[0]![2] as FormData).get("estado")).toBe("ANULADA"));
  });

  it("el menú de una orden terminada ofrece ir al acta para entregarla", async () => {
    render(<TableroOrdenes columnas={columnas(tarjeta({ estado: "TERMINADA" }))} />);

    await userEvent.click(screen.getByRole("button", { name: "Mover la orden ABC123" }));

    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /Entregar \(ir al acta\)/ })).toHaveAttribute(
      "href",
      "/ordenes/o1#entrega",
    );
  });

  it("una orden terminada sigue ofreciendo el menú, aunque no tenga destinos de arrastre", () => {
    // Su único camino es firmar el acta, así que el menú no puede desaparecer.
    render(<TableroOrdenes columnas={columnas(tarjeta({ estado: "TERMINADA" }))} />);

    expect(screen.getByRole("button", { name: "Mover la orden ABC123" })).toBeInTheDocument();
  });

  it("arrastrar a una columna válida mueve la orden", async () => {
    render(<TableroOrdenes columnas={columnas(tarjeta())} />);

    const origen = screen.getByText("ABC123").closest("[draggable]")!;
    const destino = screen.getByText("Terminada").closest("[data-columna]")!;

    fireEvent.dragStart(origen);
    fireEvent.dragOver(destino);
    fireEvent.drop(destino);

    expect(mockUpdateEstado).toHaveBeenCalledTimes(1);
    expect((mockUpdateEstado.mock.calls[0]![2] as FormData).get("estado")).toBe("TERMINADA");
  });

  it("no deja soltar en una columna inválida ni en Entregada", async () => {
    render(<TableroOrdenes columnas={columnas(tarjeta({ estado: "BORRADOR" }))} />);

    const origen = screen.getByText("ABC123").closest("[draggable]")!;
    fireEvent.dragStart(origen);

    for (const nombre of ["Terminada", "Entregada"]) {
      const destino = screen.getByText(nombre).closest("[data-columna]")!;
      fireEvent.dragOver(destino);
      fireEvent.drop(destino);
    }

    expect(mockUpdateEstado).not.toHaveBeenCalled();
  });

  it("soltar en la misma columna no hace nada", async () => {
    render(<TableroOrdenes columnas={columnas(tarjeta({ estado: "BORRADOR" }))} />);

    const origen = screen.getByText("ABC123").closest("[draggable]")!;
    const misma = screen.getByText("Borrador").closest("[data-columna]")!;
    fireEvent.dragStart(origen);
    fireEvent.dragOver(misma);
    fireEvent.drop(misma);

    expect(mockUpdateEstado).not.toHaveBeenCalled();
  });

  it("una orden ya no editable no se arrastra ni ofrece menú", () => {
    render(<TableroOrdenes columnas={columnas(tarjeta({ estado: "ENTREGADA", movible: false }))} />);

    expect(screen.queryByRole("button", { name: "Mover la orden ABC123" })).not.toBeInTheDocument();
    expect(screen.getByText("ABC123").closest("[draggable='false']")).not.toBeNull();
  });

  it("muestra el error de la acción sin romper el tablero", async () => {
    const { toast } = await import("sonner");
    mockUpdateEstado.mockResolvedValue({ error: "No se puede cambiar de BORRADOR a TERMINADA", advertencia: null });
    render(<TableroOrdenes columnas={columnas(tarjeta({ estado: "BORRADOR" }))} />);

    const origen = screen.getByText("ABC123").closest("[draggable]")!;
    const destino = screen.getByText("En proceso").closest("[data-columna]")!;
    fireEvent.dragStart(origen);
    fireEvent.dragOver(destino);
    fireEvent.drop(destino);

    // El aviso llega después de esperar la acción, así que hay que darle turno.
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("No se puede cambiar de BORRADOR a TERMINADA"));
  });
});
