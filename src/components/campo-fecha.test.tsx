import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CampoFecha, type CampoFechaProps } from "./campo-fecha";

// Viernes 16 de octubre de 2026 en Bogotá.
const HOY = "2026-10-16";

function Controlado(props: Partial<CampoFechaProps> & { inicial?: string }) {
  const { inicial = "", onChange, ...resto } = props;
  const [valor, setValor] = useState(inicial);
  return (
    <>
      <label htmlFor="fecha">Fecha</label>
      <CampoFecha
        id="fecha"
        tipo="vencimiento"
        hoy={HOY}
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

describe("CampoFecha", () => {
  it("muestra el día en palabras y en números; vacío dice «Elegir fecha»", () => {
    const { unmount } = render(<Controlado inicial="2026-10-16" />);
    expect(screen.getByText("Viernes 16 de octubre")).toBeInTheDocument();
    expect(screen.getByText("16/10/2026")).toBeInTheDocument();
    unmount();

    render(<Controlado />);
    expect(screen.getByText("Elegir fecha")).toBeInTheDocument();
  });

  it("el atajo «En 1 año» elige la fecha, queda marcado y explica el vencimiento", async () => {
    const usuario = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlado onChange={onChange} />);

    await usuario.click(screen.getByRole("button", { name: "En 1 año" }));

    expect(onChange).toHaveBeenCalledWith("2027-10-16");
    expect(screen.getByRole("button", { name: "En 1 año" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "En 6 meses" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Vence en 1 año")).toBeInTheDocument();
  });

  it("avisa cuando el vencimiento ya pasó", () => {
    render(<Controlado inicial="2026-10-12" />);
    expect(screen.getByText("Venció hace 4 días")).toBeInTheDocument();
  });

  it("elige una fecha escrita con Enter y cierra el calendario", async () => {
    const usuario = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlado onChange={onChange} />);

    await usuario.click(disparador());
    await usuario.type(await screen.findByLabelText("Escríbela"), "20/10/2026{Enter}");

    expect(onChange).toHaveBeenCalledWith("2026-10-20");
    expect(screen.queryByLabelText("Escríbela")).not.toBeInTheDocument();
    expect(screen.getByText("Martes 20 de octubre")).toBeInTheDocument();
  });

  it("explica cómo escribirla cuando la fecha no es válida", async () => {
    const usuario = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlado onChange={onChange} />);

    await usuario.click(disparador());
    await usuario.type(await screen.findByLabelText("Escríbela"), "99/99{Enter}");

    expect(screen.getByText("Escríbela así: 16/10/2026")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("con máximo en hoy no deja elegir mañana", async () => {
    const usuario = userEvent.setup();
    render(<Controlado tipo="pasado" max={HOY} />);

    await usuario.click(disparador());

    expect(await screen.findByRole("button", { name: /^sábado 17 de octubre/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^viernes 16 de octubre/ })).toBeEnabled();
  });

  it("sin controlar envía el valor en el formulario y lo cambia con un atajo", async () => {
    const usuario = userEvent.setup();
    render(
      <form data-testid="form">
        <CampoFecha id="fecha" name="fecha" tipo="pasado" hoy={HOY} defaultValue="2026-10-01" />
      </form>,
    );
    const enviado = () => new FormData(screen.getByTestId("form") as HTMLFormElement).get("fecha");

    expect(enviado()).toBe("2026-10-01");
    await usuario.click(screen.getByRole("button", { name: "Hoy" }));
    expect(enviado()).toBe("2026-10-16");
  });

  it("«Borrar» deja la fecha vacía y no aparece si es obligatoria", async () => {
    const usuario = userEvent.setup();
    const onChange = vi.fn();
    const { unmount } = render(<Controlado inicial="2026-10-20" obligatorio />);
    await usuario.click(disparador());
    await screen.findByLabelText("Escríbela");
    expect(screen.queryByRole("button", { name: "Borrar" })).not.toBeInTheDocument();
    unmount();

    render(<Controlado inicial="2026-10-20" onChange={onChange} />);
    await usuario.click(disparador());
    await usuario.click(await screen.findByRole("button", { name: "Borrar" }));

    expect(onChange).toHaveBeenCalledWith("");
    expect(screen.getByText("Elegir fecha")).toBeInTheDocument();
  });
});
