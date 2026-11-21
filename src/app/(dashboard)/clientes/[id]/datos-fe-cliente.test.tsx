import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/actions/cliente-fe-actions", () => ({ guardarDatosFeClienteAction: vi.fn() }));

import { DatosFeCliente } from "./datos-fe-cliente";

const MUNICIPIOS = [{ codigo: "11001", nombre: "Bogotá, D.C.", departamento: "Bogotá, D.C." }];
const base = {
  id: "c1",
  nombre: "Andrea",
  telefono: null,
  email: null,
  documento: "1020304050",
  tipoDocumento: null,
  dv: null,
  tipoPersona: null,
  responsabilidadFiscal: null,
  municipioCodigo: null,
  direccion: null,
};

describe("DatosFeCliente", () => {
  it("con datos incompletos de persona natural avisa que irá como consumidor final", () => {
    render(<DatosFeCliente cliente={base} municipios={MUNICIPIOS} puedeEditar />);
    expect(screen.getByText("Datos para factura electrónica")).toBeInTheDocument();
    expect(screen.getByText("Incompletos: se facturará como consumidor final.")).toBeInTheDocument();
  });

  it("con datos completos lo dice", () => {
    render(
      <DatosFeCliente
        cliente={{ ...base, tipoDocumento: "13", tipoPersona: "NATURAL", responsabilidadFiscal: "R-99-PN", municipioCodigo: "11001", direccion: "Cra 7" }}
        municipios={MUNICIPIOS}
        puedeEditar
      />,
    );
    expect(screen.getByText("Completos")).toBeInTheDocument();
  });

  it("empresa incompleta: no se podrá enviar", () => {
    render(<DatosFeCliente cliente={{ ...base, tipoPersona: "JURIDICA" }} municipios={MUNICIPIOS} puedeEditar />);
    expect(screen.getByText("Incompletos: no se podrá enviar la factura hasta completarlos.")).toBeInTheDocument();
  });

  it("sin permiso de editar no muestra el botón de guardar", () => {
    render(<DatosFeCliente cliente={base} municipios={MUNICIPIOS} puedeEditar={false} />);
    expect(screen.queryByRole("button", { name: "Guardar datos" })).toBeNull();
  });
});
