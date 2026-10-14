import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NavSeccionesDashboard } from "./secciones-dashboard";

describe("NavSeccionesDashboard", () => {
  it("tiene un botón por sección, en el orden de la página, incluidas las alertas del taller", () => {
    render(<NavSeccionesDashboard />);

    const enlaces = within(screen.getByRole("navigation", { name: "Secciones del dashboard" })).getAllByRole("link");
    expect(enlaces.map((enlace) => [enlace.textContent, enlace.getAttribute("href")])).toEqual([
      ["Resumen", "#resumen"],
      ["Flujo del taller", "#flujo-taller"],
      ["Agenda de hoy", "#agenda-hoy"],
      ["Facturación", "#facturacion"],
      ["Alertas del taller", "#alertas-taller"],
      ["Inventario", "#alertas-inventario"],
    ]);
  });
});
