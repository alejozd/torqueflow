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

  it("guarda solo al elegir el combustible, con el kilometraje que hay", async () => {
    render(<RecepcionForm ordenId="o1" kilometrajeIngreso={185210} nivelCombustible={null} soloLectura={false} />);

    await userEvent.click(screen.getByRole("radio", { name: "1/2" }));

    const datos = mockGuardar.mock.calls[0]![2] as FormData;
    expect([datos.get("kilometrajeIngreso"), datos.get("nivelCombustible")]).toEqual(["185210", "MEDIO"]);
    expect(await screen.findByRole("status")).toHaveTextContent("Guardado");
  });

  it("guarda el kilometraje al salir del campo, solo si cambió", async () => {
    render(<RecepcionForm ordenId="o1" kilometrajeIngreso={185210} nivelCombustible="LLENO" soloLectura={false} />);
    const km = screen.getByRole("spinbutton", { name: "Kilometraje" });

    await userEvent.click(km);
    await userEvent.tab();
    expect(mockGuardar).not.toHaveBeenCalled();

    await userEvent.clear(km);
    await userEvent.type(km, "185300");
    await userEvent.tab();

    const datos = mockGuardar.mock.calls[0]![2] as FormData;
    expect([datos.get("kilometrajeIngreso"), datos.get("nivelCombustible")]).toEqual(["185300", "LLENO"]);
  });

  it("en solo lectura muestra lo registrado y nada más", () => {
    render(<RecepcionForm ordenId="o1" kilometrajeIngreso={85000} nivelCombustible="MEDIO" soloLectura />);

    expect(screen.getByText("85000")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("avisa cuando no hay nada registrado", () => {
    render(<RecepcionForm ordenId="o1" kilometrajeIngreso={null} nivelCombustible={null} soloLectura />);

    expect(screen.getAllByText("Sin registrar")).toHaveLength(2);
  });

  it("muestra el error de la action", async () => {
    mockGuardar.mockResolvedValue({ error: "El kilometraje no puede ser negativo", success: false });
    render(<RecepcionForm ordenId="o1" kilometrajeIngreso={null} nivelCombustible={null} soloLectura={false} />);

    await userEvent.click(screen.getByRole("radio", { name: "Lleno" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El kilometraje no puede ser negativo");
  });
});
