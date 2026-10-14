import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import InicioLoading from "./loading";

describe("InicioLoading (skeleton del Inicio)", () => {
  it("copia la estructura de la página para que nada salte al cargar", () => {
    const { container } = render(<InicioLoading />);

    // La misma barra de secciones (es estática: ya se puede usar mientras carga).
    expect(screen.getByRole("navigation", { name: "Secciones del dashboard" })).toBeInTheDocument();
    // Seis tarjetas de resumen, en la misma rejilla de seis columnas.
    const resumen = container.querySelector('[data-skeleton="resumen"]')!;
    expect(resumen).toHaveClass("xl:grid-cols-6");
    expect(resumen.querySelectorAll('[data-slot="card"]')).toHaveLength(6);
    // Las secciones, en el orden de la página.
    const titulos = [...container.querySelectorAll('[data-slot="card-title"]')].map((titulo) => titulo.textContent);
    expect(titulos).toEqual([
      "Flujo del taller",
      "Agenda de hoy",
      "Facturación · últimos 7 días",
      "Alertas del taller",
      "Alertas de inventario",
    ]);
  });

  it("la facturación reserva las cifras, el gráfico y la lectura de la semana", () => {
    const { container } = render(<InicioLoading />);

    const facturacion = container.querySelector('[data-skeleton="facturacion"]')!;
    expect(facturacion.querySelectorAll('[data-skeleton="cifra"]')).toHaveLength(4);
    expect(facturacion.querySelectorAll('[data-skeleton="barra"]')).toHaveLength(7);
    expect(facturacion.querySelector('[data-skeleton="lectura"]')).not.toBeNull();
  });
});
