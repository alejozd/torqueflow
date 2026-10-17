import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { permisosEfectivos } from "@/lib/auth/permisos";

const mockGuardar = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh, push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/actions/usuario-actions", () => ({
  guardarPermisosUsuarioAction: (...args: unknown[]) => mockGuardar(...args),
}));

import { PermisosUsuario } from "./permisos-usuario";

describe("PermisosUsuario", () => {
  beforeEach(() => {
    mockGuardar.mockReset();
    mockGuardar.mockResolvedValue({ error: null, success: true });
  });

  it("marca con Agregado un permiso que el rol no trae", () => {
    render(<PermisosUsuario usuarioId="u1" role="TECNICO" agregados={["caja.usar"]} quitados={[]} />);
    const casilla = screen.getByRole("checkbox", { name: /Abrir y cerrar caja/ });
    expect(casilla).toBeChecked();
    expect(screen.getByText("Agregado")).toBeInTheDocument();
  });

  it("al desmarcar un permiso del rol aparece Quitado", async () => {
    const user = userEvent.setup();
    render(<PermisosUsuario usuarioId="u1" role="TECNICO" agregados={[]} quitados={[]} />);
    expect(screen.queryByText("Quitado")).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Entregar el vehículo/ }));
    expect(screen.getByText("Quitado")).toBeInTheDocument();
  });

  it("Guardar llama a la acción con la lista marcada", async () => {
    const user = userEvent.setup();
    render(<PermisosUsuario usuarioId="u1" role="TECNICO" agregados={["caja.usar"]} quitados={[]} />);
    await user.click(screen.getByRole("button", { name: "Guardar permisos" }));
    expect(mockGuardar).toHaveBeenCalledTimes(1);
    const [id, lista] = mockGuardar.mock.calls[0] as [string, string[]];
    expect(id).toBe("u1");
    expect([...lista].sort()).toEqual([...permisosEfectivos({ role: "TECNICO", agregados: ["caja.usar"] })].sort());
  });

  it("no ofrece los permisos solo de administrador", () => {
    render(<PermisosUsuario usuarioId="u1" role="TECNICO" agregados={[]} quitados={[]} />);
    expect(screen.queryByRole("checkbox", { name: /Gestionar usuarios/ })).not.toBeInTheDocument();
  });

  it("Volver al rol base pide confirmar y envía los permisos del rol", async () => {
    const user = userEvent.setup();
    render(<PermisosUsuario usuarioId="u1" role="TECNICO" agregados={["caja.usar"]} quitados={[]} />);
    await user.click(screen.getByRole("button", { name: "Volver al rol base" }));
    expect(mockGuardar).not.toHaveBeenCalled();
    const grupo = screen.getByRole("group", { name: /dejar los permisos del rol/ });
    await user.click(within(grupo).getByRole("button", { name: /Sí, volver/ }));
    const [, lista] = mockGuardar.mock.calls[0] as [string, string[]];
    expect([...lista].sort()).toEqual([...permisosEfectivos({ role: "TECNICO" })].sort());
  });

  it("al cambiar el rol (y vaciarse las excepciones) vuelve a leer las props, sin conservar el rol anterior (I5)", () => {
    const { rerender } = render(<PermisosUsuario usuarioId="u1" role="RECEPCION" agregados={[]} quitados={[]} />);
    expect(screen.getByRole("checkbox", { name: /Abrir y cerrar caja/ })).toBeChecked();

    rerender(<PermisosUsuario usuarioId="u1" role="TECNICO" agregados={[]} quitados={[]} />);

    expect(screen.getByRole("checkbox", { name: /Abrir y cerrar caja/ })).not.toBeChecked();
    expect(screen.queryByText("Agregado")).not.toBeInTheDocument();
    expect(screen.queryByText("Quitado")).not.toBeInTheDocument();
  });

  it("si falla Volver al rol base, las casillas siguen como estaban (I5)", async () => {
    mockGuardar.mockResolvedValue({ error: "No se pudo", success: false });
    const user = userEvent.setup();
    render(<PermisosUsuario usuarioId="u1" role="TECNICO" agregados={["caja.usar"]} quitados={[]} />);
    await user.click(screen.getByRole("button", { name: "Volver al rol base" }));
    const grupo = screen.getByRole("group", { name: /dejar los permisos del rol/ });
    await user.click(within(grupo).getByRole("button", { name: /Sí, volver/ }));

    expect(mockGuardar).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("checkbox", { name: /Abrir y cerrar caja/ })).toBeChecked();
    expect(screen.getByText("Agregado")).toBeInTheDocument();
  });

  it("si Volver al rol base sale bien, desmarca las excepciones y cierra la confirmación (I5)", async () => {
    const user = userEvent.setup();
    render(<PermisosUsuario usuarioId="u1" role="TECNICO" agregados={["caja.usar"]} quitados={[]} />);
    await user.click(screen.getByRole("button", { name: "Volver al rol base" }));
    const grupo = screen.getByRole("group", { name: /dejar los permisos del rol/ });
    await user.click(within(grupo).getByRole("button", { name: /Sí, volver/ }));

    expect(await screen.findByRole("button", { name: "Volver al rol base" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /dejar los permisos del rol/ })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Abrir y cerrar caja/ })).not.toBeChecked();
    expect(screen.queryByText("Agregado")).not.toBeInTheDocument();
  });
});
