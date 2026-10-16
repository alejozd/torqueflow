import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BuscadorConceptos, type OpcionBuscador } from "./buscador-conceptos";

interface Fila {
  id: string;
  nombre: string;
  libres: number;
}

const FILAS: Fila[] = [
  { id: "a", nombre: "Filtro A", libres: 2 },
  { id: "b", nombre: "Filtro B", libres: 0 },
  { id: "c", nombre: "Filtro C", libres: 5 },
];

function aOpciones(filas: Fila[]): OpcionBuscador<Fila>[] {
  return filas.map((fila) => ({
    clave: fila.id,
    valor: fila,
    noDisponible: fila.libres > 0 ? undefined : "Sin unidades libres: no se puede agregar",
    contenido: <span>{fila.nombre}</span>,
  }));
}

function pintar() {
  const onSeleccionar = vi.fn();
  const buscar = vi.fn(async () => FILAS);
  render(
    <BuscadorConceptos<Fila[], Fila>
      buscar={buscar}
      vacio={[]}
      aOpciones={aOpciones}
      onSeleccionar={onSeleccionar}
      placeholder="Buscar"
      etiqueta="Buscar repuesto"
    />,
  );
  return { onSeleccionar, buscar };
}

describe("BuscadorConceptos compartido", () => {
  it("las flechas mueven la opción activa y Enter agrega la activa", async () => {
    const { onSeleccionar } = pintar();
    const campo = screen.getByLabelText("Buscar repuesto");
    await userEvent.type(campo, "filtro");
    await screen.findByRole("option", { name: "Filtro A" });

    expect(screen.getByRole("option", { name: "Filtro A" })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("option", { name: "Filtro C" })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowUp}{ArrowDown}");
    await userEvent.keyboard("{Enter}");

    expect(onSeleccionar).toHaveBeenCalledWith(FILAS[2]);
    expect(campo).toHaveValue("");
  });

  it("un resultado sin unidades se ve atenuado, no se agrega con Enter ni con clic y se avisa", async () => {
    const { onSeleccionar } = pintar();
    await userEvent.type(screen.getByLabelText("Buscar repuesto"), "filtro");
    const sinUnidades = await screen.findByRole("option", { name: "Filtro B" });
    expect(sinUnidades).toHaveAttribute("aria-disabled", "true");

    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onSeleccionar).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Sin unidades libres"));

    await userEvent.click(sinUnidades);
    expect(onSeleccionar).not.toHaveBeenCalled();
  });

  it("un intento repetido vuelve a anunciar el aviso (se vacía y se repone) y ↑/↓ lo borran", async () => {
    pintar();
    await userEvent.type(screen.getByLabelText("Buscar repuesto"), "filtro");
    await screen.findByRole("option", { name: "Filtro B" });
    await userEvent.keyboard("{ArrowDown}{Enter}");
    const estado = screen.getByRole("status");
    await waitFor(() => expect(estado).toHaveTextContent("Sin unidades libres"));

    const cambios: string[] = [];
    const observador = new MutationObserver(() => cambios.push(estado.textContent ?? ""));
    observador.observe(estado, { childList: true, characterData: true, subtree: true });
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(cambios).toContain(""));
    await waitFor(() => expect(estado).toHaveTextContent("Sin unidades libres"));
    observador.disconnect();

    await userEvent.keyboard("{ArrowDown}");
    expect(estado).toHaveTextContent("");
  });

  it("↓ con la lista cerrada llama a onFlechaAbajo", async () => {
    const onFlechaAbajo = vi.fn();
    render(
      <BuscadorConceptos<Fila[], Fila>
        buscar={async () => FILAS}
        vacio={[]}
        aOpciones={aOpciones}
        onSeleccionar={vi.fn()}
        placeholder="Buscar"
        etiqueta="Buscar repuesto"
        onFlechaAbajo={onFlechaAbajo}
      />,
    );
    await userEvent.click(screen.getByLabelText("Buscar repuesto"));
    await userEvent.keyboard("{ArrowDown}");
    expect(onFlechaAbajo).toHaveBeenCalledTimes(1);
  });

  it("Esc cierra la lista y limpia el texto", async () => {
    pintar();
    const campo = screen.getByLabelText("Buscar repuesto");
    await userEvent.type(campo, "filtro");
    await screen.findByRole("option", { name: "Filtro A" });
    await userEvent.keyboard("{Escape}");

    expect(campo).toHaveValue("");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("Enter con un código no encontrado cierra la lista: no se queda en 'Buscando…'", async () => {
    const alEnterSinResultados = vi.fn(async () => "No se encontró el código X1");
    render(
      <BuscadorConceptos<Fila[], Fila>
        buscar={() => new Promise<Fila[]>(() => {})}
        vacio={[]}
        aOpciones={aOpciones}
        onSeleccionar={vi.fn()}
        placeholder="Buscar"
        etiqueta="Buscar repuesto"
        alEnterSinResultados={alEnterSinResultados}
      />,
    );
    await userEvent.type(screen.getByLabelText("Buscar repuesto"), "X1{Enter}");

    await waitFor(() => expect(alEnterSinResultados).toHaveBeenCalledWith("X1"));
    expect(await screen.findByText("No se encontró el código X1")).toBeInTheDocument();
    expect(screen.queryByText("Buscando…")).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
