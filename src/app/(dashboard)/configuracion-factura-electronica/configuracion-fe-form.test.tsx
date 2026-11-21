import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/app/actions/factura-electronica-config-actions", () => ({
  guardarConfiguracionFeAction: vi.fn(),
  probarConexionFeAction: vi.fn(),
}));

import { ConfiguracionFeForm } from "./configuracion-fe-form";
import type { ConfiguracionFeVista } from "@/app/actions/factura-electronica-config-actions";

const vista: ConfiguracionFeVista = {
  activa: true,
  envio: "AUTOMATICO",
  ambiente: "PRUEBAS",
  cuenta: "PROPIA",
  tokenConfigurado: true,
  nit: "900123456",
  dv: "8",
  razonSocial: "Taller Pérez",
  regimen: "48",
  responsabilidadFiscal: "O-13",
  municipioCodigo: "05001",
  direccion: "Calle 1",
  resolucionNumero: "18760000001",
  prefijo: "SETP",
  rangoDesde: 1,
  rangoHasta: 5000,
  vigenciaDesde: "2026-01-01",
  vigenciaHasta: "2027-12-31",
  siguienteConsecutivo: 40,
  prefijoNotaCredito: "NC",
  resultadoSimulado: "ACEPTAR",
  ultimaPruebaAt: null,
  ultimaPruebaExitosa: null,
  ultimaPruebaMensaje: null,
  ambienteProveedor: null,
};
const MUNICIPIOS = [{ codigo: "05001", nombre: "Medellín", departamento: "Antioquia" }];

describe("ConfiguracionFeForm", () => {
  it("llena los datos guardados y nunca muestra el token", () => {
    render(<ConfiguracionFeForm configuracion={vista} municipios={MUNICIPIOS} />);
    expect(screen.getByLabelText<HTMLInputElement>("NIT (sin DV)").value).toBe("900123456");
    expect(screen.getByLabelText<HTMLInputElement>("Prefijo").value).toBe("SETP");
    expect(screen.getByLabelText<HTMLInputElement>("Token del proveedor").value).toBe("");
    expect(screen.getByText("Déjalo en blanco para conservar el token guardado.")).toBeInTheDocument();
    expect(screen.getByText("Próximo número: SETP-40")).toBeInTheDocument();
  });

  it("al elegir producción pide confirmación antes de guardar", () => {
    render(<ConfiguracionFeForm configuracion={vista} municipios={MUNICIPIOS} />);
    fireEvent.click(screen.getByLabelText("Producción (con validez ante la DIAN)"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByRole("group", { name: "¿Pasar a producción? Desde ahí las facturas tienen validez ante la DIAN." })).toBeInTheDocument();
  });

  it("con la bolsa de TorqueFlow no deja escribir token", () => {
    render(<ConfiguracionFeForm configuracion={{ ...vista, cuenta: "BOLSA" }} municipios={MUNICIPIOS} />);
    expect(screen.queryByLabelText("Token del proveedor")).toBeNull();
    expect(screen.getByText("Con la bolsa de TorqueFlow, el token lo registra TorqueFlow.")).toBeInTheDocument();
  });

  it("el resultado simulado solo aparece en Simulado", () => {
    const { unmount } = render(<ConfiguracionFeForm configuracion={vista} municipios={MUNICIPIOS} />);
    expect(screen.queryByText("Resultado simulado")).toBeNull();
    unmount();
    render(<ConfiguracionFeForm configuracion={{ ...vista, ambiente: "SIMULADO" }} municipios={MUNICIPIOS} />);
    expect(screen.getByText("Resultado simulado")).toBeInTheDocument();
  });
});
