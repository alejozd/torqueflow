import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCerrar = vi.fn();
vi.mock("@/app/actions/caja-actions", () => ({ cerrarCajaAction: (...a: unknown[]) => mockCerrar(...a) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CerrarCajaForm } from "./cerrar-caja-form";

describe("CerrarCajaForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCerrar.mockResolvedValue({ error: null, success: true });
  });

  it("muestra la diferencia en vivo: cuadra, sobrante y faltante", async () => {
    const user = userEvent.setup();
    render(<CerrarCajaForm cajaId="c1" efectivoEsperado={150000} />);
    const campo = screen.getByLabelText("Efectivo contado");
    await user.type(campo, "150000");
    expect(screen.getByText(/Cuadra/)).toBeInTheDocument();
    await user.clear(campo);
    await user.type(campo, "152000");
    expect(screen.getByText(/Sobrante/)).toBeInTheDocument();
    await user.clear(campo);
    await user.type(campo, "148000");
    expect(screen.getByText(/Faltante/)).toBeInTheDocument();
  });

  it("pide confirmación antes de cerrar y no envía el esperado", async () => {
    const user = userEvent.setup();
    render(<CerrarCajaForm cajaId="c1" efectivoEsperado={150000} />);
    await user.type(screen.getByLabelText("Efectivo contado"), "148000");
    await user.type(screen.getByLabelText("Notas (opcional)"), "faltó una moneda");
    await user.click(screen.getByRole("button", { name: "Cerrar caja" }));
    expect(mockCerrar).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Sí, cerrar caja" }));
    await waitFor(() => expect(mockCerrar).toHaveBeenCalledTimes(1));
    expect(mockCerrar.mock.calls[0][0]).toBe("c1");
    const fd = mockCerrar.mock.calls[0][2] as FormData;
    expect(fd.get("efectivoContado")).toBe("148000");
    expect(fd.get("notas")).toBe("faltó una moneda");
    expect(fd.has("efectivoEsperado")).toBe(false);
  });

  it("'No' cancela la confirmación", async () => {
    const user = userEvent.setup();
    render(<CerrarCajaForm cajaId="c1" efectivoEsperado={0} />);
    await user.type(screen.getByLabelText("Efectivo contado"), "0");
    await user.click(screen.getByRole("button", { name: "Cerrar caja" }));
    await user.click(screen.getByRole("button", { name: "No" }));
    expect(mockCerrar).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cerrar caja" })).toBeInTheDocument();
  });
});
