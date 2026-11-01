import { describe, expect, it, vi } from "vitest";

const mockSignOut = vi.fn(async (_opciones?: unknown) => ({ url: "http://localhost:3025" }));

vi.mock("next-auth/react", () => ({ signOut: (opciones?: unknown) => mockSignOut(opciones) }));

import { cerrarSesion } from "./cerrar-sesion";

describe("cerrarSesion", () => {
  it("cierra sin dejar que NextAuth redirija y vuelve a la ruta en el origen actual", async () => {
    const navegar = vi.fn();

    await cerrarSesion("/login", navegar);

    expect(mockSignOut).toHaveBeenCalledWith({ redirect: false });
    // Ignora la url que devuelve NextAuth (la de AUTH_URL).
    expect(navegar).toHaveBeenCalledWith(`${window.location.origin}/login`);
  });

  it("navega solo después de que el cierre terminó", async () => {
    const orden: string[] = [];
    mockSignOut.mockImplementationOnce(async () => {
      orden.push("signOut");
      return { url: "" };
    });

    await cerrarSesion("/superadmin/login", () => orden.push("navegar"));

    expect(orden).toEqual(["signOut", "navegar"]);
  });
});
