import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CabeceraCotizacion, type DatosCabeceraCotizacion } from "./cabecera-cotizacion";

const AHORA = new Date("2026-09-09T15:00:00Z");

const DATOS: DatosCabeceraCotizacion = {
  numero: 6,
  estado: "ENVIADA",
  creada: new Date("2026-09-07T20:40:00Z"),
  creadoPor: "Admin Dev",
  validaHasta: new Date("2026-09-15T15:00:00Z"),
  sede: "Sede principal",
  motivo: "Cambio de filtro de aire",
  placa: "plq629",
  marca: "Mercedes-Benz",
  modelo: "W203",
  anio: 2003,
  color: "Gris",
  cliente: "Isabella Díaz",
  telefono: "3100000703",
  email: "isabella@example.com",
};

describe("CabeceraCotizacion", () => {
  it("muestra la placa, el vehículo, el cliente y el aviso de vencimiento", () => {
    render(<CabeceraCotizacion datos={DATOS} ahora={AHORA} acciones={null} />);

    expect(screen.getByRole("heading", { name: "PLQ629" })).toBeInTheDocument();
    expect(screen.getByText("Mercedes-Benz W203 2003 · Gris")).toBeInTheDocument();
    expect(screen.getByText("Isabella Díaz")).toBeInTheDocument();
    expect(screen.getByText("310 000 0703")).toBeInTheDocument();
    expect(screen.getByText("Vence en 6 días")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", expect.stringContaining("wa.me"));
  });

  it("no avisa vencimiento cuando la cotización ya se cerró", () => {
    render(<CabeceraCotizacion datos={{ ...DATOS, estado: "APROBADA" }} ahora={AHORA} acciones={null} />);

    expect(screen.queryByText(/Vence/)).not.toBeInTheDocument();
  });
});
