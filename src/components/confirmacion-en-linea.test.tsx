import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FormEvent } from "react";
import { ConfirmacionEnLinea } from "./confirmacion-en-linea";

describe("ConfirmacionEnLinea", () => {
  it("shows the question and calls onConfirmar / onCancelar", async () => {
    const onConfirmar = vi.fn();
    const onCancelar = vi.fn();
    render(
      <ConfirmacionEnLinea pregunta="¿Anular la orden?" etiquetaConfirmar="Sí, anular" onConfirmar={onConfirmar} onCancelar={onCancelar} />,
    );

    expect(screen.getByText("¿Anular la orden?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sí, anular" }));
    expect(onConfirmar).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "No" }));
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });

  it("with enviaFormulario the confirm button submits the enclosing form", async () => {
    const onSubmit = vi.fn((evento: FormEvent) => evento.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <ConfirmacionEnLinea pregunta="¿Seguro?" etiquetaConfirmar="Sí" enviaFormulario onCancelar={vi.fn()} />
      </form>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Sí" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "No" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("moves focus to 'No' and labels the group with the question", () => {
    render(<ConfirmacionEnLinea pregunta="¿Anular la orden?" etiquetaConfirmar="Sí, anular" onCancelar={vi.fn()} />);

    expect(screen.getByRole("button", { name: "No" })).toHaveFocus();
    expect(screen.getByRole("group", { name: "¿Anular la orden?" })).toBeInTheDocument();
  });

  it("disables both buttons while pendiente", () => {
    render(<ConfirmacionEnLinea pregunta="¿Seguro?" etiquetaConfirmar="Sí" pendiente onCancelar={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Sí" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "No" })).toBeDisabled();
  });
});
