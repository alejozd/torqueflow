import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EncabezadoConfiguracion } from "./pestanas-configuracion";

describe("EncabezadoConfiguracion", () => {
  it("marca la pestaña actual y enlaza la otra", () => {
    render(<EncabezadoConfiguracion actual="/configuracion-iva" />);
    expect(screen.getByRole("heading", { name: "Configuración del taller" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tarifas de IVA" })).toHaveAttribute("aria-current", "page");
    const correo = screen.getByRole("link", { name: "Correo y avisos" });
    expect(correo).toHaveAttribute("href", "/configuracion-smtp");
    expect(correo).not.toHaveAttribute("aria-current");
  });
});
