import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgregarAlTrabajo } from "./agregar-al-trabajo";

const OPCIONES = [
  {
    id: "servicio",
    etiqueta: "Aplicar servicio",
    detalle: "repuestos + mano de obra",
    contenido: <p>Formulario servicio</p>,
  },
  { id: "repuesto", etiqueta: "Repuesto", contenido: <p>Formulario repuesto</p> },
  { id: "mano-obra", etiqueta: "Mano de obra", contenido: <p>Formulario mano de obra</p> },
];

describe("AgregarAlTrabajo", () => {
  it("empieza cerrado y abre un solo formulario a la vez", async () => {
    render(<AgregarAlTrabajo opciones={OPCIONES} />);
    expect(screen.getByText("Formulario repuesto")).not.toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /^Repuesto/ }));
    expect(screen.getByRole("button", { name: /^Repuesto/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Formulario repuesto")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /Mano de obra/ }));
    expect(screen.getByText("Formulario repuesto")).not.toBeVisible();
    expect(screen.getByText("Formulario mano de obra")).toBeVisible();
  });

  it("volver a tocar el botón abierto lo cierra", async () => {
    render(<AgregarAlTrabajo opciones={OPCIONES} />);
    await userEvent.click(screen.getByRole("button", { name: /Aplicar servicio/ }));
    await userEvent.click(screen.getByRole("button", { name: /Aplicar servicio/ }));
    expect(screen.getByText("Formulario servicio")).not.toBeVisible();
  });
});
