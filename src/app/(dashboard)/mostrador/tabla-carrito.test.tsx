import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockBuscar = vi.fn();
vi.mock("@/app/actions/venta-mostrador-actions", () => ({
  buscarParaMostradorAction: (...args: unknown[]) => mockBuscar(...args),
}));

import type { RepuestoMostrador } from "@/app/actions/venta-mostrador-actions";
import { TablaCarrito } from "./tabla-carrito";
import { useCarrito } from "./use-carrito";
import { useAtajosMostrador } from "./use-atajos-mostrador";

const REPUESTOS: RepuestoMostrador[] = [
  { id: "r1", codigo: "FLT-001", nombre: "Filtro de aceite", precioVenta: 50000, stockActual: 4, disponible: 2 },
  { id: "r2", codigo: "BJ-4", nombre: "Bujía", precioVenta: 20000, stockActual: 0, disponible: 0 },
  { id: "r3", codigo: "ACE-1", nombre: "Aceite 20W50", precioVenta: 32000, stockActual: 30, disponible: 30 },
];

function Probador() {
  const carrito = useCarrito();
  return <TablaCarrito carrito={carrito} />;
}

async function agregar(texto: string, opcion: RegExp) {
  const campo = screen.getByLabelText("Buscar repuesto");
  await userEvent.type(campo, texto);
  await userEvent.click(await screen.findByRole("option", { name: opcion }));
}

describe("TablaCarrito", () => {
  beforeEach(() => {
    mockBuscar
      .mockReset()
      .mockImplementation(async (q: string) =>
        REPUESTOS.filter((r) => r.nombre.toLowerCase().includes(q.trim().toLowerCase())),
      );
  });

  it("vacío: muestra la indicación, el buscador con foco y el pie en cero", () => {
    render(<Probador />);
    expect(screen.getByText("Escanea el código o escribe el nombre del repuesto")).toBeInTheDocument();
    expect(screen.getByLabelText("Buscar repuesto")).toHaveFocus();
    expect(screen.getByTestId("pie-carrito")).toHaveTextContent("0 productos · 0 unidades");
    expect(screen.getByRole("button", { name: "Vaciar carrito" })).toBeDisabled();
  });

  it("agregar muestra la fila con chip verde; repetir suma 1 y el pie cuenta productos y unidades", async () => {
    render(<Probador />);
    await agregar("aceite 20", /Aceite 20W50/);
    expect(screen.getByRole("row", { name: "Aceite 20W50" })).toHaveTextContent("30 disponibles");
    await agregar("aceite 20", /Aceite 20W50/);
    expect(screen.getByLabelText("Cantidad de Aceite 20W50")).toHaveTextContent("2");
    expect(screen.getByTestId("pie-carrito")).toHaveTextContent("1 producto · 2 unidades");
  });

  it("+ se deshabilita al llegar al disponible y el chip pasa a ámbar 'Solo hay N'", async () => {
    render(<Probador />);
    await agregar("filtro", /Filtro de aceite/);
    const mas = screen.getByRole("button", { name: "Más Filtro de aceite" });
    expect(mas).toBeEnabled();
    await userEvent.click(mas);
    expect(mas).toBeDisabled();
    expect(screen.getByRole("row", { name: "Filtro de aceite" })).toHaveTextContent("Solo hay 2");
    expect(screen.getByRole("button", { name: "Menos Filtro de aceite" })).toBeEnabled();
  });

  it("− se deshabilita en 1", async () => {
    render(<Probador />);
    await agregar("filtro", /Filtro de aceite/);
    expect(screen.getByRole("button", { name: "Menos Filtro de aceite" })).toBeDisabled();
  });

  it("quitar pide confirmación en línea; 'No' conserva la fila y 'Sí' la saca", async () => {
    render(<Probador />);
    await agregar("filtro", /Filtro de aceite/);
    await userEvent.click(screen.getByRole("button", { name: "Quitar Filtro de aceite" }));
    expect(screen.getByRole("group", { name: /¿Quitar Filtro de aceite/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "No" }));
    expect(screen.getByRole("row", { name: "Filtro de aceite" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Quitar Filtro de aceite" }));
    await userEvent.click(screen.getByRole("button", { name: "Sí, quitar" }));
    expect(screen.queryByRole("row", { name: "Filtro de aceite" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Buscar repuesto")).toHaveFocus();
  });

  it("vaciar carrito pide confirmación", async () => {
    render(<Probador />);
    await agregar("filtro", /Filtro de aceite/);
    await userEvent.click(screen.getByRole("button", { name: "Vaciar carrito" }));
    expect(screen.getByRole("group", { name: "¿Vaciar todo el carrito?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sí, vaciar" }));
    expect(screen.getByTestId("pie-carrito")).toHaveTextContent("0 productos");
  });

  it("línea libre: se agrega con descripción y precio y no tiene tope", async () => {
    render(<Probador />);
    await userEvent.click(screen.getByRole("button", { name: "Agregar línea libre" }));
    await userEvent.type(screen.getByLabelText("Descripción de la línea libre"), "Instalación");
    await userEvent.type(screen.getByLabelText("Precio de la línea libre"), "28000");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));
    expect(screen.getByRole("row", { name: "Instalación" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Más Instalación" })).toBeEnabled();
  });

  describe("teclado", () => {
    it("↑ desde el buscador vacío va a la última fila; + y − cambian la cantidad", async () => {
      render(<Probador />);
      await agregar("aceite 20", /Aceite 20W50/);
      await agregar("filtro", /Filtro de aceite/);
      await userEvent.keyboard("{ArrowUp}");
      expect(screen.getByRole("row", { name: "Filtro de aceite" })).toHaveFocus();

      await userEvent.keyboard("+");
      expect(screen.getByLabelText("Cantidad de Filtro de aceite")).toHaveTextContent("2");
      await userEvent.keyboard("+");
      expect(screen.getByLabelText("Cantidad de Filtro de aceite")).toHaveTextContent("2");
      await userEvent.keyboard("-");
      expect(screen.getByLabelText("Cantidad de Filtro de aceite")).toHaveTextContent("1");

      await userEvent.keyboard("{ArrowUp}");
      expect(screen.getByRole("row", { name: "Aceite 20W50" })).toHaveFocus();
      await userEvent.keyboard("{ArrowDown}{ArrowDown}");
      expect(screen.getByLabelText("Buscar repuesto")).toHaveFocus();
    });

    it("Supr abre la confirmación, Esc la cancela y devuelve el foco a la fila", async () => {
      render(<Probador />);
      await agregar("filtro", /Filtro de aceite/);
      await userEvent.keyboard("{ArrowUp}{Delete}");
      expect(screen.getByRole("group", { name: /¿Quitar Filtro de aceite/ })).toBeInTheDocument();
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("group")).not.toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole("row", { name: "Filtro de aceite" })).toHaveFocus());
    });

    it("Supr y luego Enter quita la fila", async () => {
      render(<Probador />);
      await agregar("filtro", /Filtro de aceite/);
      await userEvent.keyboard("{ArrowUp}{Delete}{Enter}");
      expect(screen.queryByRole("row", { name: "Filtro de aceite" })).not.toBeInTheDocument();
      expect(screen.getByTestId("pie-carrito")).toHaveTextContent("0 productos");
    });

    it("tras pulsar Tab dentro de la confirmación, Enter ya no confirma", async () => {
      render(<Probador />);
      await agregar("filtro", /Filtro de aceite/);
      await userEvent.keyboard("{ArrowUp}{Delete}{Tab}{Enter}");
      expect(screen.getByRole("row", { name: "Filtro de aceite" })).toBeInTheDocument();
    });

    it("Esc en el buscador limpia el texto", async () => {
      render(<Probador />);
      const campo = screen.getByLabelText("Buscar repuesto");
      await userEvent.type(campo, "filtro");
      await userEvent.keyboard("{Escape}");
      expect(campo).toHaveValue("");
    });

    it("un resultado sin unidades no se agrega y se anuncia", async () => {
      render(<Probador />);
      await userEvent.type(screen.getByLabelText("Buscar repuesto"), "buj");
      const opcion = await screen.findByRole("option", { name: /Bujía/ });
      expect(opcion).toHaveAttribute("aria-disabled", "true");
      await userEvent.keyboard("{Enter}");
      await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Sin unidades libres"));
      expect(screen.getByTestId("pie-carrito")).toHaveTextContent("0 productos");
    });
  });
});

describe("useAtajosMostrador", () => {
  function Atajos({ h }: { h: Parameters<typeof useAtajosMostrador>[0] }) {
    useAtajosMostrador(h);
    return <input aria-label="campo" />;
  }
  const handlers = () => ({ focusBuscador: vi.fn(), irACobrar: vi.fn(), buscarCliente: vi.fn(), descuento: vi.fn() });

  it("F1, F2, F4, F9 y Ctrl+Enter llaman a su acción", async () => {
    const h = handlers();
    render(<Atajos h={h} />);
    await userEvent.keyboard("{F1}{F2}{F4}{F9}{Control>}{Enter}{/Control}");
    expect(h.focusBuscador).toHaveBeenCalledTimes(1);
    expect(h.buscarCliente).toHaveBeenCalledTimes(1);
    expect(h.descuento).toHaveBeenCalledTimes(1);
    expect(h.irACobrar).toHaveBeenCalledTimes(2);
  });

  it("'/' enfoca el buscador fuera de un campo, pero no mientras se escribe en uno", async () => {
    const h = handlers();
    render(<Atajos h={h} />);
    await userEvent.keyboard("/");
    expect(h.focusBuscador).toHaveBeenCalledTimes(1);
    await userEvent.type(screen.getByLabelText("campo"), "a/b");
    expect(h.focusBuscador).toHaveBeenCalledTimes(1);
  });
});
