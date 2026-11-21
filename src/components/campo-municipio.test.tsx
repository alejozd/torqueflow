import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { CampoMunicipio } from "./campo-municipio";

const MUNICIPIOS = [
  { codigo: "05001", nombre: "Medellín", departamento: "Antioquia" },
  { codigo: "11001", nombre: "Bogotá, D.C.", departamento: "Bogotá, D.C." },
];

describe("CampoMunicipio", () => {
  it("envía el código DANE elegido en un campo con el nombre pedido", () => {
    const { container } = render(<CampoMunicipio municipios={MUNICIPIOS} name="municipioCodigo" defaultValue="11001" id="m" />);
    const oculto = container.querySelector<HTMLInputElement>('input[name="municipioCodigo"]');
    expect(oculto?.value).toBe("11001");
  });

  it("sin valor guardado el campo va vacío", () => {
    const { container } = render(<CampoMunicipio municipios={MUNICIPIOS} name="municipioCodigo" defaultValue={null} id="m" />);
    expect(container.querySelector<HTMLInputElement>('input[name="municipioCodigo"]')?.value).toBe("");
  });
});
