import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { permisosEfectivos } from "@/lib/auth/permisos";
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

  it("muestra la pestaña de facturación electrónica y la marca como actual", () => {
    render(<EncabezadoConfiguracion actual="/configuracion-factura-electronica" />);
    expect(screen.getByRole("link", { name: "Facturación electrónica" })).toHaveAttribute("aria-current", "page");
  });

  it("con permisos, oculta las pestañas a las que el usuario no puede entrar", () => {
    render(
      <EncabezadoConfiguracion
        actual="/configuracion-factura-electronica"
        permisos={permisosEfectivos({ role: "RECEPCION", agregados: ["facturaElectronica.configurar"] })}
      />,
    );
    expect(screen.queryByRole("link", { name: "Correo y avisos" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Tarifas de IVA" })).toBeNull();
    expect(screen.getByRole("link", { name: "Facturación electrónica" })).toBeInTheDocument();
  });
});
