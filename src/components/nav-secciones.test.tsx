import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NavSecciones } from "./nav-secciones";

describe("NavSecciones", () => {
  it("lista un botón por sección y queda fija arriba al hacer scroll", () => {
    render(
      <NavSecciones
        etiqueta="Secciones de la orden"
        secciones={[
          { id: "informacion", label: "Información", dot: "bg-blue-500" },
          { id: "dvi", label: "DVI", dot: "bg-red-500" },
        ]}
      />,
    );

    const nav = screen.getByRole("navigation", { name: "Secciones de la orden" });
    expect(nav).toHaveClass("sticky", "top-0");
    expect(within(nav).getAllByRole("link").map((enlace) => enlace.getAttribute("href"))).toEqual(["#informacion", "#dvi"]);
  });
});
