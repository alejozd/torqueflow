import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CampoFechaHora, type CampoFechaHoraProps } from "./campo-fecha-hora";

// Viernes 16 de octubre de 2026, 10:40 a. m. en Bogotá.
const AHORA = { fecha: "2026-10-16", minutos: 640 };

function Controlado(props: Partial<CampoFechaHoraProps> & { inicial?: string }) {
  const { inicial = "2026-10-16T10:40", onChange, ...resto } = props;
  const [valor, setValor] = useState(inicial);
  return (
    <>
      <label htmlFor="fecha">Fecha</label>
      <CampoFechaHora
        id="fecha"
        ahora={AHORA}
        value={valor}
        onChange={(v) => {
          setValor(v);
          onChange?.(v);
        }}
        {...resto}
      />
    </>
  );
}

const disparador = () => screen.getByRole("button", { name: /^Fecha/ });

describe("CampoFechaHora", () => {
  it("muestra el día en palabras y la hora debajo", () => {
    render(<Controlado />);
    expect(screen.getByText("Hoy, viernes 16 de octubre")).toBeInTheDocument();
    expect(screen.getByText("a las 10:40 a. m.")).toBeInTheDocument();
  });

  it("el atajo «Ahora» elige la hora actual redondeada a 5 minutos", async () => {
    const usuario = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlado inicial="2026-10-15T08:00" ahora={{ fecha: "2026-10-16", minutos: 643 }} onChange={onChange} />);

    await usuario.click(screen.getByRole("button", { name: "Ahora" }));

    expect(onChange).toHaveBeenCalledWith("2026-10-16T10:40");
    expect(screen.getByRole("button", { name: "Ahora" })).toHaveAttribute("aria-pressed", "true");
  });

  it("con soloPasado no deja elegir una hora de hoy que no ha llegado", async () => {
    const usuario = userEvent.setup();
    render(<Controlado soloPasado />);

    await usuario.click(disparador());

    expect(await screen.findByRole("button", { name: "11:00 a. m." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "10:30 a. m." })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^sábado 17 de octubre/ })).toBeDisabled();
  });

  it("elegir ayer y luego 3:00 p. m. arma el valor y cierra", async () => {
    const usuario = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlado soloPasado onChange={onChange} />);

    await usuario.click(disparador());
    await usuario.click(await screen.findByRole("button", { name: /^jueves 15 de octubre/ }));
    await usuario.click(screen.getByRole("button", { name: "3:00 p. m." }));

    expect(onChange).toHaveBeenLastCalledWith("2026-10-15T15:00");
    expect(screen.queryByRole("group", { name: "Hora" })).not.toBeInTheDocument();
    expect(screen.getByText("Ayer, jueves 15 de octubre")).toBeInTheDocument();
    expect(screen.getByText("a las 3:00 p. m.")).toBeInTheDocument();
  });

  it("al volver a hoy con una hora futura la ajusta a «Ahora»", async () => {
    const usuario = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlado inicial="2026-10-15T15:00" soloPasado onChange={onChange} />);

    await usuario.click(disparador());
    await usuario.click(await screen.findByRole("button", { name: /^viernes 16 de octubre/ }));

    expect(onChange).toHaveBeenLastCalledWith("2026-10-16T10:40");
  });

  it("emite el valor en un campo oculto con name", () => {
    render(
      <form data-testid="form">
        <CampoFechaHora id="fecha" name="fecha" ahora={AHORA} value="2026-10-16T10:40" onChange={() => {}} />
      </form>,
    );
    expect(new FormData(screen.getByTestId("form") as HTMLFormElement).get("fecha")).toBe("2026-10-16T10:40");
  });

  it("oculta «Hoy en la mañana» antes de las 9", () => {
    render(<Controlado ahora={{ fecha: "2026-10-16", minutos: 8 * 60 }} inicial="2026-10-16T08:00" />);
    expect(screen.queryByRole("button", { name: "Hoy en la mañana" })).not.toBeInTheDocument();
  });
});
