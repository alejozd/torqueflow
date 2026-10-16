import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CampoMes } from "./campo-mes";

// Viernes 16 de octubre de 2026 en Bogotá.
const HOY = "2026-10-16";

function montar(props: Partial<React.ComponentProps<typeof CampoMes>> = {}) {
  return render(
    <form data-testid="f">
      <label htmlFor="mes">Mes</label>
      <CampoMes id="mes" name="periodo" hoy={HOY} defaultValue="2026-10" {...props} />
    </form>,
  );
}

const enviado = () => new FormData(screen.getByTestId("f") as HTMLFormElement).get("periodo");

describe("CampoMes", () => {
  it("muestra el mes en palabras y que va corriendo", () => {
    montar();
    expect(screen.getByText("Octubre de 2026")).toBeInTheDocument();
    expect(screen.getByText("Del 1 al 16, va corriendo")).toBeInTheDocument();
    expect(enviado()).toBe("2026-10");
  });

  it("no deja pasar del mes actual sin permitirFuturo", () => {
    montar();
    expect(screen.getByRole("button", { name: "Mes siguiente" })).toBeDisabled();
  });

  it("‹ pasa al mes anterior y lo envía en el formulario", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: "Mes anterior" }));
    expect(enviado()).toBe("2026-09");
    expect(screen.getByText("Mes completo · 30 días")).toBeInTheDocument();
  });

  it("elegir «mar» de 2026 en el popover da 2026-03", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: /^Mes Octubre/ }));
    await userEvent.click(await screen.findByRole("button", { name: "marzo de 2026" }));
    expect(enviado()).toBe("2026-03");
  });

  it("opcional sin valor dice «Sin mes»", () => {
    montar({ defaultValue: "", opcional: true, permitirFuturo: true });
    expect(screen.getByText("Sin mes")).toBeInTheDocument();
    expect(enviado()).toBe("");
  });
});
