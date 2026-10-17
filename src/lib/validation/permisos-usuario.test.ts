import { describe, expect, it } from "vitest";
import { permisosMarcadosSchema } from "./permisos-usuario";

describe("permisosMarcadosSchema", () => {
  it("acepta permisos conocidos", () => {
    expect(permisosMarcadosSchema.safeParse(["caja.usar", "clientes.ver"]).success).toBe(true);
  });
  it("rechaza claves desconocidas", () => {
    const r = permisosMarcadosSchema.safeParse(["caja.inventada"]);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe("Ese permiso no se puede dar a este usuario");
  });
  it("rechaza permisos solo de administrador", () => {
    const r = permisosMarcadosSchema.safeParse(["usuarios.gestionar"]);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe("Ese permiso no se puede dar a este usuario");
  });
});
