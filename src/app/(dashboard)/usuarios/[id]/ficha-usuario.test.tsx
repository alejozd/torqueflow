import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockGuardarPermisos = vi.fn();
const mockUpdateUsuario = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/actions/usuario-actions", () => ({
  guardarPermisosUsuarioAction: (...args: unknown[]) => mockGuardarPermisos(...args),
  updateUsuarioAction: (...args: unknown[]) => mockUpdateUsuario(...args),
  deleteUsuarioFormAction: vi.fn(),
}));

import { FichaUsuario, decidirGuardado } from "./ficha-usuario";

const USUARIO = {
  id: "u1",
  nombre: "Tomás Técnico",
  email: "tomas@dev.test",
  role: "TECNICO" as const,
  activo: true,
  sedeDefectoId: null,
  sedeIds: [],
  permisosAgregados: [],
  permisosQuitados: [],
  createdAt: new Date("2023-03-15T15:00:00.000Z"),
};

describe("decidirGuardado (D1)", () => {
  it("solo permisos → solo la acción de permisos", () => {
    expect(decidirGuardado({ formConCambios: false, cambiaRol: false, permisosConCambios: 2 })).toEqual({
      formulario: false,
      permisos: true,
    });
  });

  it("datos y permisos sin cambiar el rol → las dos acciones", () => {
    expect(decidirGuardado({ formConCambios: true, cambiaRol: false, permisosConCambios: 1 })).toEqual({
      formulario: true,
      permisos: true,
    });
  });

  it("si cambia el rol se guarda solo el formulario: los permisos vuelven a los del rol nuevo", () => {
    expect(decidirGuardado({ formConCambios: true, cambiaRol: true, permisosConCambios: 3 })).toEqual({
      formulario: true,
      permisos: false,
    });
  });
});

describe("FichaUsuario", () => {
  beforeEach(() => {
    mockGuardarPermisos.mockReset().mockResolvedValue({ error: null, success: true });
    mockUpdateUsuario.mockReset();
  });

  it("sin cambios no muestra la barra; al marcar un permiso aparece y Guardar llama solo a la acción de permisos", async () => {
    const user = userEvent.setup();
    render(<FichaUsuario usuario={USUARIO} sedes={[]} />);
    expect(screen.queryByText("Tienes cambios sin guardar")).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /Abrir y cerrar caja/ }));
    const barra = screen.getByRole("region", { name: "Cambios sin guardar" });
    await user.click(within(barra).getByRole("button", { name: "Guardar cambios" }));

    expect(mockGuardarPermisos).toHaveBeenCalledWith("u1", expect.arrayContaining(["caja.usar"]));
    expect(mockUpdateUsuario).not.toHaveBeenCalled();
  });

  it("si falla el guardado, la barra sigue visible", async () => {
    mockGuardarPermisos.mockResolvedValue({ error: "No se pudo", success: false });
    const user = userEvent.setup();
    render(<FichaUsuario usuario={USUARIO} sedes={[]} />);
    await user.click(screen.getByRole("checkbox", { name: /Abrir y cerrar caja/ }));
    await user.click(screen.getAllByRole("button", { name: "Guardar cambios" })[0]!);
    expect(screen.getByText("Tienes cambios sin guardar")).toBeInTheDocument();
  });

  it("Descartar vuelve a lo guardado", async () => {
    const user = userEvent.setup();
    render(<FichaUsuario usuario={USUARIO} sedes={[]} />);
    await user.click(screen.getByRole("checkbox", { name: /Abrir y cerrar caja/ }));
    await user.click(screen.getByRole("button", { name: "Descartar" }));
    expect(screen.getByRole("checkbox", { name: /Abrir y cerrar caja/ })).not.toBeChecked();
    expect(screen.queryByText("Tienes cambios sin guardar")).not.toBeInTheDocument();
  });

  it("al cambiar un dato del formulario, Guardar envía el formulario y no la acción de permisos", async () => {
    mockUpdateUsuario.mockResolvedValue({ error: null, success: true });
    const user = userEvent.setup();
    // Un técnico necesita al menos una sede para pasar la validación del formulario.
    render(
      <FichaUsuario
        usuario={{ ...USUARIO, sedeIds: ["s1"], sedeDefectoId: "s1" }}
        sedes={[{ id: "s1", nombre: "Norte" }]}
      />,
    );
    await user.clear(screen.getByLabelText("Nombre"));
    await user.type(screen.getByLabelText("Nombre"), "Tomás Pérez");
    await user.click(screen.getAllByRole("button", { name: "Guardar cambios" })[0]!);
    await vi.waitFor(() => expect(mockUpdateUsuario).toHaveBeenCalled());
    expect(mockGuardarPermisos).not.toHaveBeenCalled();
  });

  it("cambiar solo la contraseña: al guardar sale el toast y la barra desaparece (revisión, I1/I2)", async () => {
    mockUpdateUsuario.mockResolvedValue({ error: null, success: true });
    const { toast } = await import("sonner");
    const user = userEvent.setup();
    render(
      <FichaUsuario
        usuario={{ ...USUARIO, sedeIds: ["s1"], sedeDefectoId: "s1" }}
        sedes={[{ id: "s1", nombre: "Norte" }]}
      />,
    );
    await user.type(screen.getByLabelText("Contraseña"), "clave-nueva-123");
    await user.click(screen.getAllByRole("button", { name: "Guardar cambios" })[0]!);
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith("Usuario actualizado"));
    await vi.waitFor(() => expect(screen.queryByText("Tienes cambios sin guardar")).not.toBeInTheDocument());
  });

  it("formulario inválido + permisos: no guarda nada a medias (revisión, I3)", async () => {
    const user = userEvent.setup();
    // Técnico sin sedes: el formulario no pasa la validación.
    render(<FichaUsuario usuario={USUARIO} sedes={[]} />);
    await user.type(screen.getByLabelText("Nombre"), " X");
    await user.click(screen.getByRole("checkbox", { name: /Abrir y cerrar caja/ }));
    await user.click(screen.getAllByRole("button", { name: "Guardar cambios" })[0]!);
    expect(mockUpdateUsuario).not.toHaveBeenCalled();
    expect(mockGuardarPermisos).not.toHaveBeenCalled();
  });

  it("formulario válido + permisos: los permisos se guardan después del formulario (revisión, I3)", async () => {
    mockUpdateUsuario.mockResolvedValue({ error: null, success: true });
    const user = userEvent.setup();
    render(
      <FichaUsuario
        usuario={{ ...USUARIO, sedeIds: ["s1"], sedeDefectoId: "s1" }}
        sedes={[{ id: "s1", nombre: "Norte" }]}
      />,
    );
    await user.type(screen.getByLabelText("Nombre"), " X");
    await user.click(screen.getByRole("checkbox", { name: /Abrir y cerrar caja/ }));
    await user.click(screen.getAllByRole("button", { name: "Guardar cambios" })[0]!);
    await vi.waitFor(() => expect(mockGuardarPermisos).toHaveBeenCalled());
    expect(mockUpdateUsuario.mock.invocationCallOrder[0]!).toBeLessThan(mockGuardarPermisos.mock.invocationCallOrder[0]!);
  });

  it("un ADMIN no tiene sección de permisos", () => {
    render(<FichaUsuario usuario={{ ...USUARIO, role: "ADMIN" }} sedes={[]} />);
    expect(screen.getByText("El administrador tiene todos los permisos")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Abrir y cerrar caja/ })).not.toBeInTheDocument();
  });
});
