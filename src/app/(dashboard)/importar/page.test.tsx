import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { permisosEfectivos } from "@/lib/auth/permisos";
import userEvent from "@testing-library/user-event";

const mockRequirePermiso = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requirePermiso: (...args: unknown[]) => mockRequirePermiso(...args),
  puede: (session: { user: { permisos: string[] } }, permiso: string) => session.user.permisos.includes(permiso),
  requireSession: vi.fn(),
}));
vi.mock("@/app/actions/bodega-actions", () => ({
  listBodegas: () => Promise.resolve([{ id: "b1", nombre: "Bodega principal" }]),
}));
vi.mock("@/app/actions/proveedor-actions", () => ({
  listProveedores: () => Promise.resolve([{ id: "p1", nombre: "Repuestos del Norte" }]),
}));
vi.mock("@/app/actions/importacion-actions", () => ({ importarAction: vi.fn() }));

import ImportarPage from "./page";

describe("ImportarPage", () => {
  beforeEach(() => {
    mockRequirePermiso
      .mockReset()
      .mockResolvedValue({ user: { id: "u1", role: "ADMIN", permisos: permisosEfectivos({ role: "ADMIN" }) } });
  });

  it("exige el permiso de importar y arma el formulario con bodegas y proveedores", async () => {
    render(await ImportarPage());

    expect(mockRequirePermiso).toHaveBeenCalledWith("importar.usar");
    expect(screen.getByRole("heading", { name: "Importar desde Excel" })).toBeInTheDocument();
    // Los dos selectores se llenan con lo que devuelven las actions de la página.
    expect(screen.getByLabelText("Bodega de los repuestos")).toBeInTheDocument();
    expect(screen.getByLabelText("Proveedor del stock inicial")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Bodega de los repuestos"));
    expect(await screen.findByRole("option", { name: "Bodega principal" })).toBeInTheDocument();
  });

  it("enlaza la descarga de la plantilla", async () => {
    render(await ImportarPage());

    expect(screen.getByRole("link", { name: "Descargar plantilla (.xlsx)" })).toHaveAttribute(
      "href",
      "/api/importacion/plantilla",
    );
  });

  it("avisa a recepción de que la hoja de servicios se omitirá", async () => {
    mockRequirePermiso.mockResolvedValue({
      user: { id: "u2", role: "RECEPCION", permisos: permisosEfectivos({ role: "RECEPCION" }) },
    });

    render(await ImportarPage());

    expect(screen.getByText(/La hoja de Servicios solo la puede importar un administrador/)).toBeInTheDocument();
  });
});
