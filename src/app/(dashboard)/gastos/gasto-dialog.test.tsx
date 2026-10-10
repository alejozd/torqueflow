import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCrear = vi.fn();
const mockActualizar = vi.fn();
vi.mock("@/app/actions/gasto-actions", () => ({
  crearGastoAction: (...args: unknown[]) => mockCrear(...args),
  actualizarGastoAction: (...args: unknown[]) => mockActualizar(...args),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { GastoDialog } from "./gasto-dialog";

const categorias = [
  { id: "c1", nombre: "Arriendo", activo: true, orden: 0 },
  { id: "c2", nombre: "Insumos", activo: true, orden: 1 },
];

describe("GastoDialog", () => {
  beforeEach(() => {
    mockCrear.mockReset();
    mockCrear.mockResolvedValue({ error: null, success: true });
  });

  it("con descripción vacía y monto 0 no llama a la action y muestra el error", async () => {
    const user = userEvent.setup();
    render(<GastoDialog modo="crear" categorias={categorias} sedeIdPorDefecto="s1" />);
    await user.click(screen.getByRole("button", { name: "Nuevo gasto" }));
    await user.type(await screen.findByLabelText("Monto"), "0");
    await user.click(screen.getByRole("button", { name: "Registrar gasto" }));
    expect(await screen.findByText("La descripción es obligatoria")).toBeInTheDocument();
    expect(mockCrear).not.toHaveBeenCalled();
  });

  it("con datos válidos llama crearGastoAction con el FormData", async () => {
    const user = userEvent.setup();
    render(<GastoDialog modo="crear" categorias={categorias} sedeIdPorDefecto="s1" />);
    await user.click(screen.getByRole("button", { name: "Nuevo gasto" }));
    await user.click(await screen.findByRole("combobox", { name: /categoría/i }));
    await user.click(await screen.findByRole("option", { name: "Insumos" }));
    await user.type(screen.getByLabelText("Descripción"), "Aceite");
    await user.type(screen.getByLabelText("Monto"), "200000");
    await user.click(screen.getByRole("button", { name: "Registrar gasto" }));
    await waitFor(() => expect(mockCrear).toHaveBeenCalledTimes(1));
    const fd = mockCrear.mock.calls[0][1] as FormData;
    expect(fd.get("categoriaId")).toBe("c2");
    expect(fd.get("descripcion")).toBe("Aceite");
    expect(fd.get("monto")).toBe("200000");
    expect(fd.get("fecha")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("RECEPCION no ve el selector de sede; ADMIN sí", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<GastoDialog modo="crear" categorias={categorias} sedeIdPorDefecto="s1" />);
    await user.click(screen.getByRole("button", { name: "Nuevo gasto" }));
    await screen.findByLabelText("Monto");
    expect(screen.queryByText("Sede")).not.toBeInTheDocument();
    unmount();

    render(
      <GastoDialog modo="crear" categorias={categorias} sedeIdPorDefecto="s1" sedes={[{ id: "s1", nombre: "Principal" }]} />,
    );
    await user.click(screen.getByRole("button", { name: "Nuevo gasto" }));
    expect(await screen.findByText("Sede")).toBeInTheDocument();
  });
});
