import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCrear = vi.fn();
vi.mock("@/app/actions/venta-mostrador-actions", () => ({
  crearVentaMostradorAction: (...args: unknown[]) => mockCrear(...args),
}));

import { CarritoMostrador } from "./carrito-mostrador";
import type { RepuestoMostrador } from "@/app/actions/venta-mostrador-actions";

const REPUESTOS: RepuestoMostrador[] = [
  { id: "r1", codigo: "FLT-001", nombre: "Filtro de aceite", precioVenta: 50000, stockActual: 4, disponible: 3 },
  { id: "r2", codigo: "BJ-4", nombre: "Bujía", precioVenta: 20000, stockActual: 0, disponible: 0 },
];

function pintar(cambios: { efectivoBloqueado?: boolean } = {}) {
  return render(
    <CarritoMostrador
      repuestos={REPUESTOS}
      clientes={[{ id: "c1", nombre: "Ana Pérez" }]}
      efectivoBloqueado={cambios.efectivoBloqueado ?? false}
    />,
  );
}

async function agregarFiltro() {
  await userEvent.type(screen.getByLabelText("Buscar repuesto"), "Filtro");
  await userEvent.click(screen.getByRole("button", { name: "Agregar" }));
}

describe("CarritoMostrador", () => {
  beforeEach(() => {
    mockCrear.mockReset().mockResolvedValue({ error: null, success: true, numero: 9 });
  });

  it("con el control de caja y la caja cerrada, solo bloquea el cobro en efectivo", { timeout: 20_000 }, async () => {
    pintar({ efectivoBloqueado: true });

    expect(screen.getByText(/para cobrar en efectivo abre la caja/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Buscar repuesto")).toBeEnabled();
    await agregarFiltro();
    // Efectivo es el método por defecto: no se puede registrar.
    expect(screen.getByRole("button", { name: "Registrar venta" })).toBeDisabled();

    await userEvent.click(screen.getByLabelText("Cobro"));
    await userEvent.click(await screen.findByRole("option", { name: "Tarjeta" }));
    expect(screen.getByRole("button", { name: "Registrar venta" })).toBeEnabled();
  });

  it("sin bloqueo de efectivo no muestra el aviso de caja", () => {
    pintar();

    expect(screen.queryByText(/abre la caja/i)).not.toBeInTheDocument();
  });

  it("agrega un repuesto y calcula el total con IVA, como el servidor", async () => {
    pintar();

    expect(screen.getByText(/Todavía no has agregado nada/i)).toBeInTheDocument();
    await agregarFiltro();

    // 50.000 + 19% de IVA
    expect(screen.getByTestId("total-venta")).toHaveTextContent("59.500");
    expect(screen.getByLabelText("Cantidad")).toHaveValue(1);
  });

  it("no deja agregar más unidades que las libres", { timeout: 20_000 }, async () => {
    pintar();

    // Al agregar, el buscador se limpia y la lista se desmonta: hay que volver a
    // escribir y a buscar el botón en cada vuelta.
    for (let vuelta = 0; vuelta < 3; vuelta++) {
      await userEvent.type(screen.getByLabelText("Buscar repuesto"), "Filtro");
      await userEvent.click(await screen.findByRole("button", { name: "Agregar" }));
    }

    // El repuesto tiene 3 libres: se agregaron las tres y no una cuarta.
    expect(screen.getAllByLabelText("Cantidad")).toHaveLength(3);
    await userEvent.type(screen.getByLabelText("Buscar repuesto"), "Filtro");
    expect(screen.getByText("sin unidades libres")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar" })).toBeDisabled();
  });

  it("envía las líneas como JSON con lo que hay en el carrito", async () => {
    pintar();

    await agregarFiltro();
    await userEvent.click(screen.getByRole("button", { name: "Registrar venta" }));

    expect(mockCrear).toHaveBeenCalledTimes(1);
    const formData = mockCrear.mock.calls[0]![1] as FormData;
    expect(JSON.parse(String(formData.get("lineas")))).toEqual([
      { repuestoId: "r1", descripcion: "Filtro de aceite", cantidad: 1, precioUnitario: 50000 },
    ]);
    expect(formData.get("metodoPago")).toBe("EFECTIVO");
    expect(formData.get("cobrarTodo")).toBe("true");
  });

  it("sin cliente y sin cobrar todo, no deja guardar (la venta quedaría sin a quién cobrarle)", async () => {
    pintar();

    await agregarFiltro();
    await userEvent.click(screen.getByLabelText(/Cobrar todo ahora/i));

    expect(screen.getByText(/Sin cliente, la venta tiene que quedar pagada/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar venta" })).toBeDisabled();

    // Con un cliente identificado sí se puede dejar a crédito.
    await userEvent.click(screen.getByLabelText("Cliente (opcional)"));
    await userEvent.click(await screen.findByRole("option", { name: "Ana Pérez" }));
    expect(screen.getByRole("button", { name: "Registrar venta" })).toBeEnabled();
  });

  it("permite una línea libre (mano de obra o algo que no está en inventario)", async () => {
    pintar();

    await userEvent.click(screen.getByRole("button", { name: "Agregar línea libre" }));
    await userEvent.type(screen.getByLabelText("Descripción"), "Mano de obra");
    await userEvent.clear(screen.getByLabelText("Precio"));
    await userEvent.type(screen.getByLabelText("Precio"), "40000");

    // 40.000 + 19% de IVA
    expect(screen.getByTestId("total-venta")).toHaveTextContent("47.600");
  });
});
