import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

vi.mock("@/lib/auth/guards", () => ({
  requirePermiso: async () => ({ user: { role: "ADMIN", permisos: [] } }),
}));
vi.mock("@/app/actions/usuario-actions", () => ({
  listUsuariosConMetricas: async () => [
    usuario("u-admin", "Ana Admin", "ADMIN"),
    usuario("u-tec", "Tomás Técnico", "TECNICO"),
  ],
}));
vi.mock("@/app/actions/sede-actions", () => ({ listSedes: async () => [] }));
vi.mock("./editar-usuario-dialog", () => ({ EditarUsuarioDialog: () => null }));
vi.mock("./nuevo-usuario-dialog", () => ({ NuevoUsuarioDialog: () => null }));

import UsuariosPage from "./page";

function usuario(id: string, nombre: string, role: string) {
  return {
    id,
    nombre,
    email: `${id}@taller.co`,
    role,
    activo: true,
    sedeDefectoId: null,
    sedeIds: [],
    permisosAgregados: [],
    permisosQuitados: [],
    ordenesActivas: 0,
  };
}

type Columna = { header: string; cell: (fila: ReturnType<typeof usuario>) => ReactNode };

function buscarColumnas(nodo: ReactNode): Columna[] | undefined {
  if (Array.isArray(nodo)) {
    for (const n of nodo) {
      const c = buscarColumnas(n);
      if (c) return c;
    }
  } else if (nodo && typeof nodo === "object" && "props" in nodo) {
    const props = (nodo as ReactElement<{ columns?: Columna[]; children?: ReactNode }>).props;
    if (props.columns) return props.columns;
    return buscarColumnas(props.children);
  }
  return undefined;
}

async function acciones(fila: ReturnType<typeof usuario>) {
  const columnas = buscarColumnas(await UsuariosPage({ searchParams: Promise.resolve({}) }))!;
  const columna = columnas.find((c) => c.header === "Acciones")!;
  return render(<>{columna.cell(fila)}</>);
}

describe("UsuariosPage: acceso a los permisos del usuario", () => {
  it("cada usuario que no es ADMIN tiene un enlace a su ficha de permisos", async () => {
    await acciones(usuario("u-tec", "Tomás Técnico", "TECNICO"));
    expect(screen.getByRole("link", { name: "Permisos" })).toHaveAttribute("href", "/usuarios/u-tec");
  });

  it("el ADMIN no tiene enlace de permisos (tiene todos)", async () => {
    await acciones(usuario("u-admin", "Ana Admin", "ADMIN"));
    expect(screen.queryByRole("link", { name: "Permisos" })).toBeNull();
  });
});
