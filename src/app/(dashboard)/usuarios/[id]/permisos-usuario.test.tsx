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
    await user.click(screen.getByRole("checkbox", { name: /Cambiar el estado de la orden/ }));
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

  describe("tarjetas, buscador y acciones masivas (rediseño, tarea 3)", () => {
    it("muestra el aviso del rol y el contador de cada grupo, que cambia al marcar", async () => {
      const user = userEvent.setup();
      render(<PermisosUsuario usuarioId="u1" role="TECNICO" agregados={["caja.usar"]} quitados={[]} />);
      const delRol = permisosEfectivos({ role: "TECNICO" }).length;
      expect(screen.getByText(`Permisos del rol Técnico: ${delRol} · 1 cambio`)).toBeInTheDocument();
      const dinero = screen.getByRole("group", { name: /Dinero/ });
      expect(within(dinero).getByText(/^1 \/ \d+ activos$/)).toBeInTheDocument();
      await user.click(within(dinero).getByRole("checkbox", { name: /Ver cartera/ }));
      expect(within(dinero).getByText(/^2 \/ \d+ activos$/)).toBeInTheDocument();
    });

    it("el buscador filtra sin importar tildes ni mayúsculas y oculta los grupos sin coincidencias", async () => {
      const user = userEvent.setup();
      render(<PermisosUsuario usuarioId="u1" role="TECNICO" agregados={[]} quitados={[]} />);
      await user.type(screen.getByRole("searchbox", { name: "Buscar permiso" }), "CAJA");
      expect(screen.getByRole("checkbox", { name: /Abrir y cerrar caja/ })).toBeInTheDocument();
      expect(screen.queryByRole("group", { name: /Citas/ })).not.toBeInTheDocument();
      await user.clear(screen.getByRole("searchbox", { name: "Buscar permiso" }));
      await user.type(screen.getByRole("searchbox", { name: "Buscar permiso" }), "vehiculo");
      expect(screen.getByRole("checkbox", { name: /Entregar el vehículo/ })).toBeInTheDocument();
    });

    it("Marcar todos con filtro marca solo lo visible y nunca un permiso solo de administrador", async () => {
      const user = userEvent.setup();
      render(<PermisosUsuario usuarioId="u1" role="TECNICO" agregados={[]} quitados={[]} />);
      await user.type(screen.getByRole("searchbox", { name: "Buscar permiso" }), "caja");
      await user.click(screen.getByRole("button", { name: "Marcar todos" }));
      await user.clear(screen.getByRole("searchbox", { name: "Buscar permiso" }));
      expect(screen.getByRole("checkbox", { name: /Abrir y cerrar caja/ })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: /Ver cartera/ })).not.toBeChecked();
      await user.click(screen.getByRole("button", { name: "Guardar permisos" }));
      const enviados = mockGuardar.mock.calls[0]![1] as string[];
      expect(enviados).not.toContain("usuarios.gestionar");
    });

    it("Desmarcar todos quita lo visible", async () => {
      const user = userEvent.setup();
      render(<PermisosUsuario usuarioId="u1" role="TECNICO" agregados={[]} quitados={[]} />);
      await user.click(screen.getByRole("button", { name: "Desmarcar todos" }));
      expect(screen.getAllByRole("checkbox").every((c) => !(c as HTMLInputElement).checked)).toBe(true);
    });

    it("marcar un permiso marca sus requisitos (Facturar → Ver facturas)", async () => {
      const user = userEvent.setup();
      render(<PermisosUsuario usuarioId="u1" role="TECNICO" agregados={[]} quitados={[]} />);
      await user.click(screen.getByRole("checkbox", { name: /Facturar y registrar pagos/ }));
      expect(screen.getByRole("checkbox", { name: /Ver facturas/ })).toBeChecked();
    });

    it("desmarcar un requisito desmarca lo que depende de él (Ver órdenes → Cambiar estado)", async () => {
      const user = userEvent.setup();
      render(<PermisosUsuario usuarioId="u1" role="TECNICO" agregados={[]} quitados={[]} />);
      await user.click(screen.getByRole("checkbox", { name: /^Ver órdenes/ }));
      expect(screen.getByRole("checkbox", { name: /Cambiar el estado de la orden/ })).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: /Agregar trabajo a la orden/ })).not.toBeChecked();
    });

    it("Marcar todos con filtro también marca los requisitos que no se ven", async () => {
      const user = userEvent.setup();
      render(<PermisosUsuario usuarioId="u1" role="TECNICO" agregados={[]} quitados={[]} />);
      await user.type(screen.getByRole("searchbox", { name: "Buscar permiso" }), "pedidos");
      await user.click(screen.getByRole("button", { name: "Marcar todos" }));
      await user.clear(screen.getByRole("searchbox", { name: "Buscar permiso" }));
      expect(screen.getByRole("checkbox", { name: /Ver pedidos y entradas/ })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: /Ver costos/ })).toBeChecked();
    });

    it("Solo lectura no agrega permisos de ver que el usuario no tenía", async () => {
      const user = userEvent.setup();
      // El técnico no tiene ordenes.verTodas ni auditoria.ver.
      render(<PermisosUsuario usuarioId="u1" role="TECNICO" agregados={[]} quitados={[]} />);
      await user.click(screen.getByRole("button", { name: "Solo lectura" }));
      await user.click(screen.getByRole("button", { name: "Guardar permisos" }));
      const enviados = mockGuardar.mock.calls[0]![1] as string[];
      expect(enviados).toContain("ordenes.ver");
      expect(enviados).not.toContain("ordenes.verTodas");
      expect(enviados).not.toContain("auditoria.ver");
    });

    it("Solo lectura deja marcados solo los permisos de ver", async () => {
      const user = userEvent.setup();
      render(<PermisosUsuario usuarioId="u1" role="RECEPCION" agregados={[]} quitados={[]} />);
      await user.click(screen.getByRole("button", { name: "Solo lectura" }));
      await user.click(screen.getByRole("button", { name: "Guardar permisos" }));
      const enviados = mockGuardar.mock.calls[0]![1] as string[];
      expect(enviados.length).toBeGreaterThan(0);
      expect(enviados.every((p) => p.endsWith(".ver") || p.endsWith(".verTodas") || p === "inventario.costos")).toBe(true);
      // Recepción conserva Ver pedidos: ver costos cuenta como lectura y es su requisito.
      expect(enviados).toContain("compras.ver");
      expect(enviados).toContain("clientes.ver");
    });
  });
});
