import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RangoFechas } from "./rango-fechas";

// Viernes 16 de octubre de 2026 en Bogotá.
const HOY = "2026-10-16";

function renderRango(desde = "2026-10-01", hasta = "2026-10-16") {
  render(
    <form aria-label="Filtros">
      <label htmlFor="periodo">Periodo</label>
      <RangoFechas id="periodo" defaultDesde={desde} defaultHasta={hasta} hoy={HOY} />
    </form>,
  );
}

const datos = () => new FormData(screen.getByRole("form", { name: "Filtros" }) as HTMLFormElement);
const disparador = () => screen.getByRole("button", { name: /^Periodo/ });

describe("RangoFechas", () => {
  it("muestra el periodo en palabras y sus días", () => {
    renderRango();
    expect(disparador()).toHaveTextContent("Este mes");
    expect(screen.getByText("1 – 16 de octubre · 16 días")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Este mes", pressed: true })).toBeInTheDocument();
  });

  it("el atajo «Mes pasado» cambia los campos ocultos", async () => {
    const user = userEvent.setup();
    renderRango();
    await user.click(screen.getByRole("button", { name: "Mes pasado" }));
    expect(datos().get("desde")).toBe("2026-09-01");
    expect(datos().get("hasta")).toBe("2026-09-30");
    expect(screen.getByRole("button", { name: "Mes pasado", pressed: true })).toBeInTheDocument();
  });

  it("un rango a mano al revés se invierte y queda personalizado", async () => {
    const user = userEvent.setup();
    renderRango();
    await user.click(disparador());
    expect(screen.getByText("Toca el primer día y luego el último.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^viernes 9 de octubre/ }));
    expect(screen.getByText("Desde el viernes 9 de octubre. Ahora toca el último día.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^lunes 5 de octubre/ }));

    expect(datos().get("desde")).toBe("2026-10-05");
    expect(datos().get("hasta")).toBe("2026-10-09");
    expect(screen.getByText("5 – 9 de octubre")).toBeInTheDocument();
    expect(screen.getByText("Personalizado · 5 días")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("elegir un periodo en la lista cierra el calendario", async () => {
    const user = userEvent.setup();
    renderRango();
    await user.click(disparador());
    const lista = screen.getByRole("group", { name: "Periodos" });
    await user.click(lista.querySelector<HTMLButtonElement>("button:nth-child(8)")!);
    expect(datos().get("desde")).toBe("2026-01-01");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("los días después de hoy quedan deshabilitados", async () => {
    const user = userEvent.setup();
    renderRango();
    await user.click(disparador());
    expect(screen.getByRole("button", { name: /^sábado 17 de octubre/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^viernes 16 de octubre/ })).toBeEnabled();
  });
});
