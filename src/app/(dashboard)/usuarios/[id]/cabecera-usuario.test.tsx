import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CabeceraUsuario } from "./cabecera-usuario";

const CREADO = new Date("2023-03-15T15:00:00.000Z");

describe("CabeceraUsuario", () => {
  it("muestra iniciales, nombre, correo, antigüedad y el chip Activo", () => {
    render(<CabeceraUsuario nombre="Andrés Silva" email="andres@dev.test" activo createdAt={CREADO} />);
    expect(screen.getByText("AS")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Andrés Silva" })).toBeInTheDocument();
    expect(screen.getByText(/andres@dev\.test · Miembro desde marzo de 2023/)).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
  });

  it("un usuario suspendido muestra Suspendido", () => {
    render(<CabeceraUsuario nombre="Tomás" email="t@dev.test" activo={false} createdAt={CREADO} />);
    expect(screen.getByText("Suspendido")).toBeInTheDocument();
    expect(screen.getByText("T")).toBeInTheDocument();
  });
});
