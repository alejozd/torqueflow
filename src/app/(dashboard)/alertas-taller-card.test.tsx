import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { AlertaTaller } from "@/app/actions/alertas-taller-actions";
import { AlertasTallerCard } from "./alertas-taller-card";

const ESTANCADA: AlertaTaller = {
  ordenId: "o1",
  motivo: "ESTANCADA",
  dias: 6,
  prioridad: "URGENTE",
  placa: "ABC123",
  cliente: "Ana",
  mecanico: "Luis",
  sintomas: "Ruido",
};

const SIN_ENTREGAR: AlertaTaller = {
  ...ESTANCADA,
  ordenId: "o2",
  motivo: "TERMINADA_SIN_ENTREGAR",
  dias: 4,
  prioridad: "NORMAL",
  placa: "XYZ789",
  cliente: "Beto",
  mecanico: null,
};

/** `n` alertas con placas P1, P2… en el orden en que llegan (ya ordenadas por la acción). */
function varias(n: number, base: AlertaTaller): AlertaTaller[] {
  return Array.from({ length: n }, (_, i) => ({ ...base, ordenId: `${base.ordenId}-${i}`, placa: `${base.placa}-${i}` }));
}

function filasDeOrden() {
  return within(screen.getByRole("list")).getAllByRole("link");
}

describe("AlertasTallerCard", () => {
  it("sin alertas lo dice, muestra el umbral y no ofrece contadores ni 'Ver todas'", () => {
    render(<AlertasTallerCard diasUmbral={3} alertas={[]} />);

    expect(screen.getByText(/Ninguna orden estancada/)).toBeInTheDocument();
    expect(screen.getByText("Sin actividad en 3 días o más")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("los contadores de la cabecera cuentan por motivo y llevan a su filtro en /ordenes", () => {
    render(<AlertasTallerCard diasUmbral={3} alertas={[...varias(2, ESTANCADA), SIN_ENTREGAR]} />);

    expect(screen.getByRole("link", { name: "2 Estancadas" })).toHaveAttribute("href", "/ordenes?alerta=ESTANCADA");
    expect(screen.getByRole("link", { name: "1 Sin entregar" })).toHaveAttribute(
      "href",
      "/ordenes?alerta=TERMINADA_SIN_ENTREGAR",
    );
  });

  it("con 5 o menos muestra todas: placa, cliente, días y motivo; prioridad solo si no es normal", () => {
    render(<AlertasTallerCard diasUmbral={3} alertas={[ESTANCADA, SIN_ENTREGAR]} />);

    const [primera, segunda] = filasDeOrden();
    expect(primera).toHaveAttribute("href", "/ordenes/o1");
    expect(primera).toHaveTextContent("ABC123");
    expect(primera).toHaveTextContent("Ana");
    expect(primera).toHaveTextContent("6 días");
    expect(primera).toHaveTextContent("Estancada");
    expect(primera).toHaveTextContent("Urgente");

    expect(segunda).toHaveAttribute("href", "/ordenes/o2");
    expect(segunda).toHaveTextContent("XYZ789");
    expect(segunda).toHaveTextContent("Sin entregar");
    expect(segunda).not.toHaveTextContent("Normal");

    expect(screen.queryByRole("link", { name: /Ver todas/ })).not.toBeInTheDocument();
  });

  it("con más de 5 muestra solo las 5 primeras, en el orden recibido, y ofrece 'Ver todas'", () => {
    const alertas = [...varias(4, ESTANCADA), ...varias(3, SIN_ENTREGAR)];
    render(<AlertasTallerCard diasUmbral={3} alertas={alertas} />);

    const filas = filasDeOrden();
    expect(filas).toHaveLength(5);
    expect(filas.map((fila) => fila.getAttribute("href"))).toEqual(
      alertas.slice(0, 5).map((alerta) => `/ordenes/${alerta.ordenId}`),
    );
    expect(screen.getByText("Mostrando 5 de 7")).toBeInTheDocument();
    // Los contadores cuentan todas, no solo las visibles.
    expect(screen.getByRole("link", { name: "4 Estancadas" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "3 Sin entregar" })).toBeInTheDocument();
    // Con los dos motivos, "Ver todas" ofrece cada filtro.
    expect(screen.getByRole("link", { name: "Ver todas las estancadas" })).toHaveAttribute(
      "href",
      "/ordenes?alerta=ESTANCADA",
    );
    expect(screen.getByRole("link", { name: "Ver todas las sin entregar" })).toHaveAttribute(
      "href",
      "/ordenes?alerta=TERMINADA_SIN_ENTREGAR",
    );
  });

  it("con más de 5 de un solo motivo, 'Ver todas' es un único enlace a ese filtro", () => {
    render(<AlertasTallerCard diasUmbral={3} alertas={varias(6, SIN_ENTREGAR)} />);

    expect(screen.getByRole("link", { name: "Ver todas" })).toHaveAttribute(
      "href",
      "/ordenes?alerta=TERMINADA_SIN_ENTREGAR",
    );
    expect(screen.getByRole("link", { name: "0 Estancadas" })).toHaveAttribute("href", "/ordenes?alerta=ESTANCADA");
  });

  it("un solo día se dice en singular", () => {
    render(<AlertasTallerCard diasUmbral={1} alertas={[{ ...ESTANCADA, dias: 1 }]} />);

    expect(filasDeOrden()[0]).toHaveTextContent("1 día");
    expect(filasDeOrden()[0]).not.toHaveTextContent("1 días");
  });
});
