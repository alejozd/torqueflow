import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BannerSintomas, CabeceraOrden, type DatosCabecera } from "./cabecera-orden";

const DATOS: DatosCabecera = {
  id: "cmv8k4u9z000dk08wui7ithg3",
  estado: "BORRADOR",
  ingreso: new Date("2026-10-14T20:23:30Z"),
  sede: "Sede principal",
  recibio: "Admin Dev",
  placa: "yor558",
  marca: "BMW",
  modelo: "X3",
  anio: 2009,
  color: "Gris",
  tipo: "CAMIONETA",
  cliente: "Camila Sánchez Rojas",
  telefono: "3100000259",
};

describe("CabeceraOrden", () => {
  it("pone la placa, el vehículo, el cliente y el estado arriba", () => {
    render(<CabeceraOrden datos={DATOS} mecanico={<span>Luis Torres</span>} acciones={<button>Avanzar</button>} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("YOR558");
    expect(screen.getByText("BMW X3 2009 · Gris · Camioneta")).toBeInTheDocument();
    expect(screen.getByText("Camila Sánchez Rojas")).toBeInTheDocument();
    expect(screen.getByText("Borrador")).toBeInTheDocument();
    expect(screen.getByText("Orden #UI7ITHG3")).toBeInTheDocument();
    expect(screen.getByText("Luis Torres")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Avanzar" })).toBeInTheDocument();
  });

  it("deja llamar y escribir por WhatsApp al cliente", () => {
    render(<CabeceraOrden datos={DATOS} mecanico={null} acciones={null} />);
    expect(screen.getByRole("link", { name: /310 000 0259/ })).toHaveAttribute("href", "tel:3100000259");
    expect(screen.getByRole("link", { name: /WhatsApp/ }).getAttribute("href")).toMatch(
      /^https:\/\/wa\.me\/573100000259\?text=/,
    );
  });

  it("sin teléfono no ofrece llamar ni WhatsApp", () => {
    render(<CabeceraOrden datos={{ ...DATOS, telefono: null }} mecanico={null} acciones={null} />);
    expect(screen.queryByRole("link", { name: /WhatsApp/ })).not.toBeInTheDocument();
  });
});

describe("BannerSintomas", () => {
  it("destaca lo que reporta el cliente", () => {
    render(<BannerSintomas sintomas="ruido en la rueda trasera izquierda" />);
    expect(screen.getByText("El cliente reporta")).toBeInTheDocument();
    expect(screen.getByText("ruido en la rueda trasera izquierda")).toBeInTheDocument();
  });

  it("sin síntomas no pinta nada", () => {
    const { container } = render(<BannerSintomas sintomas={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
