import { describe, expect, it } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SelectorFechaHora, type SelectorFechaHoraProps } from "./selector-fecha-hora";

// Jueves 15 de octubre de 2026, 10:40 a. m. en Bogotá.
const AHORA = { fecha: "2026-10-15", minutos: 10 * 60 + 40 };

function Prueba(props: Partial<SelectorFechaHoraProps> & { inicial?: string }) {
  const { inicial = "", ...resto } = props;
  const [valor, setValor] = useState(inicial);
  return (
    <form data-testid="form">
      <SelectorFechaHora
        id="fechaHora"
        name="fechaHora"
        value={valor}
        onChange={setValor}
        ahora={AHORA}
        ocupacion={[]}
        {...resto}
      />
    </form>
  );
}

const valorEnviado = () => new FormData(screen.getByTestId("form") as HTMLFormElement).get("fechaHora");

describe("SelectorFechaHora", () => {
  it("arranca en hoy sin hora y no envía nada todavía", () => {
    render(<Prueba />);

    expect(screen.getByRole("radio", { name: /^Hoy, jueves 15 de octubre/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Elegiste jueves 15 de octubre. Falta la hora.")).toBeInTheDocument();
    expect(valorEnviado()).toBe("");
  });

  it("deshabilita las horas de hoy que ya pasaron", () => {
    render(<Prueba />);

    expect(screen.getByRole("radio", { name: "10:30 a. m., ya pasó" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("radio", { name: "11:00 a. m." })).not.toHaveAttribute("aria-disabled");
  });

  it("envía YYYY-MM-DDTHH:mm al elegir día y hora, y conserva la hora al cambiar de día", async () => {
    const usuario = userEvent.setup();
    render(<Prueba />);

    await usuario.click(screen.getByRole("radio", { name: /^Mañana, viernes 16 de octubre/ }));
    await usuario.click(screen.getByRole("radio", { name: "2:00 p. m." }));
    expect(valorEnviado()).toBe("2026-10-16T14:00");
    expect(screen.getByText(/La cita queda para/)).toHaveTextContent("La cita queda para mañana, viernes 16 de octubre a las 2:00 p. m.");

    await usuario.click(screen.getByRole("radio", { name: /sábado 17 de octubre/ }));
    expect(valorEnviado()).toBe("2026-10-17T14:00");
  });

  it("se mueve entre horas con las flechas", async () => {
    const usuario = userEvent.setup();
    render(<Prueba inicial="2026-10-16T08:00" />);

    screen.getByRole("radio", { name: "8:00 a. m." }).focus();
    await usuario.keyboard("{ArrowRight}");
    expect(valorEnviado()).toBe("2026-10-16T08:30");
    expect(screen.getByRole("radio", { name: "8:30 a. m." })).toHaveFocus();
  });

  it("acepta una hora escrita a mano y la muestra aunque no esté en la grilla", async () => {
    const usuario = userEvent.setup();
    render(<Prueba inicial="2026-10-16T08:00" />);

    await usuario.type(screen.getByLabelText("¿Otra hora?"), "10:15{Enter}");
    expect(valorEnviado()).toBe("2026-10-16T10:15");
    expect(screen.getByRole("radio", { name: "10:15 a. m." })).toHaveAttribute("aria-checked", "true");

    await usuario.type(screen.getByLabelText("¿Otra hora?"), "banana{Enter}");
    expect(screen.getByText("No entendí esa hora. Prueba con 10:15 o 3:45 pm.")).toBeInTheDocument();
  });

  it("muestra la ocupación real del día sin bloquear la hora", () => {
    render(
      <Prueba
        inicial="2026-10-16T08:00"
        ocupacion={[
          { fecha: "2026-10-16", minutos: 8 * 60, placa: "JKT482", motivo: "Cambio de aceite" },
          { fecha: "2026-10-16", minutos: 10 * 60 + 30, placa: "MRW615", motivo: "Frenos" },
        ]}
      />,
    );

    expect(screen.getByRole("radio", { name: /viernes 16 de octubre, ya hay 2 citas/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "8:00 a. m., ya hay 1 cita" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Mañana ya hay 2 citas:")).toBeInTheDocument();
    expect(screen.getByText("MRW615")).toBeInTheDocument();
  });

  it("al editar respeta la hora original aunque ya haya pasado", () => {
    render(<Prueba inicial="2026-10-15T09:00" valorOriginal="2026-10-15T09:00" />);

    expect(screen.getByRole("radio", { name: "9:00 a. m." })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "9:00 a. m." })).not.toHaveAttribute("aria-disabled");
    expect(screen.getByRole("radio", { name: "9:30 a. m., ya pasó" })).toHaveAttribute("aria-disabled", "true");
    expect(valorEnviado()).toBe("2026-10-15T09:00");
  });

  it("elige una fecha lejana desde el calendario", async () => {
    const usuario = userEvent.setup();
    render(<Prueba />);

    await usuario.click(screen.getByRole("button", { name: "Elegir otra fecha en el calendario" }));
    await usuario.click(screen.getByRole("button", { name: "Mes siguiente" }));
    await usuario.click(screen.getByRole("button", { name: /^miércoles 25 de noviembre/ }));

    expect(screen.getByRole("button", { name: /Fecha elegida: miércoles 25 de noviembre/ })).toBeInTheDocument();
    expect(screen.getByText("Elegiste miércoles 25 de noviembre. Falta la hora.")).toBeInTheDocument();
  });
});
