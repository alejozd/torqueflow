import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/actions/cliente-fe-actions", () => ({ guardarDatosFeClienteAction: vi.fn() }));

import { DatosFeCliente } from "./datos-fe-cliente";

const MUNICIPIOS = [{ codigo: "11001", nombre: "Bogotá, D.C.", departamento: "Bogotá, D.C." }];
const base = {
  id: "c1",
  tipoDocumento: null,
  dv: null,
  tipoPersona: null,
  responsabilidadFiscal: null,
  municipioCodigo: null,
  direccion: null,
};
const INCOMPLETO = { completo: false, texto: "Incompletos: se facturará como consumidor final." };

describe("DatosFeCliente", () => {
  it("muestra el estado de los datos que calcula el servidor", () => {
    render(<DatosFeCliente cliente={base} estado={INCOMPLETO} municipios={MUNICIPIOS} puedeEditar />);
    expect(screen.getByText("Datos para factura electrónica")).toBeInTheDocument();
    expect(screen.getByText("Incompletos: se facturará como consumidor final.")).toBeInTheDocument();
  });

  it("con permiso de editar deja guardar y los campos se pueden cambiar", () => {
    render(<DatosFeCliente cliente={base} estado={INCOMPLETO} municipios={MUNICIPIOS} puedeEditar />);
    expect(screen.getByRole("button", { name: "Guardar datos" })).toBeInTheDocument();
    expect(screen.getByLabelText("Dirección")).toBeEnabled();
  });

  it("sin permiso de editar no muestra el botón de guardar y los campos quedan bloqueados", () => {
    render(<DatosFeCliente cliente={base} estado={INCOMPLETO} municipios={MUNICIPIOS} puedeEditar={false} />);
    expect(screen.queryByRole("button", { name: "Guardar datos" })).toBeNull();
    expect(screen.getByLabelText("Dirección")).toBeDisabled();
    expect(screen.getByLabelText("DV (solo con NIT)")).toBeDisabled();
  });
});
