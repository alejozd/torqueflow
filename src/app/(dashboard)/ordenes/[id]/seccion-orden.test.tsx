import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SeccionOrden } from "./seccion-orden";

function renderSeccion(abiertaInicial: boolean) {
  return render(
    <>
      <a href="#items">Ir a ítems</a>
      <SeccionOrden id="items" titulo="Ítems" resumen="3 · $450.000" accion={<button type="button">Imprimir</button>} abiertaInicial={abiertaInicial}>
        <p>Contenido de ítems</p>
      </SeccionOrden>
    </>,
  );
}

describe("SeccionOrden", () => {
  it("plegada muestra el título y el resumen, oculta el contenido, y se abre con un clic", async () => {
    renderSeccion(false);

    const boton = screen.getByRole("button", { name: /Ítems/ });
    expect(boton).toHaveAttribute("aria-expanded", "false");
    expect(boton).toHaveTextContent("3 · $450.000");
    expect(screen.getByText("Contenido de ítems")).not.toBeVisible();

    await userEvent.click(boton);

    expect(boton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Contenido de ítems")).toBeVisible();
  });

  it("los botones propios del encabezado no pliegan la sección", async () => {
    renderSeccion(true);

    await userEvent.click(screen.getByRole("button", { name: "Imprimir" }));

    expect(screen.getByRole("button", { name: /Ítems/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("saltar a la sección desde la barra (enlace o cambio de #) la abre", async () => {
    renderSeccion(false);

    await userEvent.click(screen.getByRole("link", { name: "Ir a ítems" }));
    expect(screen.getByRole("button", { name: /Ítems/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("también se abre si la página llega con #items en la dirección", () => {
    renderSeccion(false);

    act(() => {
      window.location.hash = "#items";
      fireEvent(window, new HashChangeEvent("hashchange"));
    });

    expect(screen.getByRole("button", { name: /Ítems/ })).toHaveAttribute("aria-expanded", "true");
    window.location.hash = "";
  });
});
