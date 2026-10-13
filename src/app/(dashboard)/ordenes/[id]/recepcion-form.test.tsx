import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockGuardar = vi.fn();
vi.mock("@/app/actions/recepcion-actions", () => ({
  guardarRecepcionAction: (...args: unknown[]) => mockGuardar(...args),
}));

import { RecepcionForm, etiquetaNivel } from "./recepcion-form";

describe("etiquetaNivel", () => {
  it("traduce el nivel a algo que se entiende", () => {
    expect(etiquetaNivel("MEDIO")).toBe("1/2");
    expect(etiquetaNivel("TRES_CUARTOS")).toBe("3/4");
    expect(etiquetaNivel(null)).toBe("Sin registrar");
  });
});

describe("RecepcionForm", () => {
  beforeEach(() => {
    mockGuardar.mockReset().mockResolvedValue({ error: null, success: true });
  });

  it("guarda el kilometraje y el nivel elegido", async () => {
    render(<RecepcionForm ordenId="o1" kilometrajeIngreso={null} nivelCombustible={null} soloLectura={false} />);

    await userEvent.type(screen.getByLabelText("Kilometraje"), "85000");
    await userEvent.click(screen.getByLabelText("Combustible"));
    await userEvent.click(await screen.findByRole("option", { name: "3/4" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar recepción" }));

    expect(mockGuardar).toHaveBeenCalledTimes(1);
    const formData = mockGuardar.mock.calls[0]![2] as FormData;
    expect(formData.get("kilometrajeIngreso")).toBe("85000");
    expect(formData.get("nivelCombustible")).toBe("TRES_CUARTOS");
  });

  it("en solo lectura muestra lo registrado y nada más", () => {
    render(<RecepcionForm ordenId="o1" kilometrajeIngreso={85000} nivelCombustible="MEDIO" soloLectura />);

    expect(screen.getByText("85000")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar recepción" })).not.toBeInTheDocument();
  });

  it("avisa cuando no hay nada registrado", () => {
    render(<RecepcionForm ordenId="o1" kilometrajeIngreso={null} nivelCombustible={null} soloLectura />);

    expect(screen.getAllByText("Sin registrar")).toHaveLength(2);
  });

  it("muestra el error de la action", async () => {
    mockGuardar.mockResolvedValue({ error: "El kilometraje no puede ser negativo", success: false });
    render(<RecepcionForm ordenId="o1" kilometrajeIngreso={null} nivelCombustible={null} soloLectura={false} />);

    await userEvent.click(screen.getByRole("button", { name: "Guardar recepción" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El kilometraje no puede ser negativo");
  });
});
