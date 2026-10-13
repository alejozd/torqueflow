import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AlertasTallerCard } from "./alertas-taller-card";

const ESTANCADA = {
  ordenId: "o1",
  motivo: "ESTANCADA" as const,
  dias: 6,
  prioridad: "URGENTE" as const,
  placa: "ABC123",
  cliente: "Ana",
  mecanico: "Luis",
  sintomas: "Ruido",
};

const SIN_ENTREGAR = { ...ESTANCADA, ordenId: "o2", motivo: "TERMINADA_SIN_ENTREGAR" as const, dias: 4, prioridad: "NORMAL" as const, placa: "XYZ789", mecanico: null };

describe("AlertasTallerCard", () => {
  it("sin alertas lo dice y muestra el umbral vigente", () => {
    render(<AlertasTallerCard diasUmbral={3} alertas={[]} />);

    expect(screen.getByText(/Ninguna orden estancada/)).toBeInTheDocument();
    expect(screen.getByText("Sin actividad en 3 días o más")).toBeInTheDocument();
    expect(screen.getByText("· 0 órdenes")).toBeInTheDocument();
  });

  it("lista cada alerta con sus días, su motivo, su prioridad y el enlace a la orden", () => {
    render(<AlertasTallerCard diasUmbral={3} alertas={[ESTANCADA, SIN_ENTREGAR]} />);

    expect(screen.getByText("· 2 órdenes")).toBeInTheDocument();

    const primera = screen.getByRole("link", { name: /ABC123/ });
    expect(primera).toHaveAttribute("href", "/ordenes/o1");
    expect(primera).toHaveTextContent("6 días");
    expect(primera).toHaveTextContent("Estancada en proceso");
    expect(primera).toHaveTextContent("Urgente");
    expect(primera).toHaveTextContent("Luis");

    const segunda = screen.getByRole("link", { name: /XYZ789/ });
    expect(segunda).toHaveAttribute("href", "/ordenes/o2");
    expect(segunda).toHaveTextContent("Terminada sin entregar");
    expect(segunda).toHaveTextContent("sin mecánico");
  });

  it("un solo día se dice en singular", () => {
    render(<AlertasTallerCard diasUmbral={1} alertas={[{ ...ESTANCADA, dias: 1 }]} />);

    expect(screen.getByText("1 día")).toBeInTheDocument();
  });
});
