import { describe, expect, it } from "vitest";
import {
  CANTIDAD_MAXIMA_KIT,
  aplicarServicioInputSchema,
  listarServiciosInputSchema,
  servicioInputSchema,
  servicioRepuestoInputSchema,
} from "./servicio";

const servicioBase = { nombre: "Cambio de aceite", precioManoObra: "45000" };

describe("servicioInputSchema", () => {
  it("acepta un servicio válido, recorta textos y convierte el precio", () => {
    const r = servicioInputSchema.parse({
      nombre: "  Cambio de aceite ",
      descripcion: "  Aceite y filtro  ",
      precioManoObra: "45000",
    });
    expect(r).toEqual({ nombre: "Cambio de aceite", descripcion: "Aceite y filtro", precioManoObra: 45000 });
  });

  it("acepta precio de mano de obra 0 y el máximo exacto", () => {
    expect(servicioInputSchema.parse({ ...servicioBase, precioManoObra: "0" }).precioManoObra).toBe(0);
    expect(servicioInputSchema.safeParse({ ...servicioBase, precioManoObra: "99999999.99" }).success).toBe(true);
  });

  it("descripción vacía u omitida queda undefined", () => {
    expect(servicioInputSchema.parse({ ...servicioBase, descripcion: "   " }).descripcion).toBeUndefined();
    expect(servicioInputSchema.parse(servicioBase).descripcion).toBeUndefined();
  });

  it.each([
    [{ nombre: "   " }, "El nombre es obligatorio"],
    [{ nombre: "x".repeat(81) }, "El nombre admite máximo 80 caracteres"],
    [{ precioManoObra: "-1" }, "El precio no puede ser negativo"],
    [{ precioManoObra: "100000000" }, "El precio es demasiado alto"],
    [{ precioManoObra: "abc" }, "El precio debe ser un número"],
  ])("rechaza %o", (cambio, mensaje) => {
    const r = servicioInputSchema.safeParse({ ...servicioBase, ...cambio });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(mensaje);
  });

  it("rechaza una descripción de más de 300 caracteres", () => {
    expect(servicioInputSchema.safeParse({ ...servicioBase, descripcion: "x".repeat(301) }).success).toBe(false);
  });
});

describe("servicioRepuestoInputSchema", () => {
  it("acepta un repuesto del kit y convierte la cantidad", () => {
    expect(servicioRepuestoInputSchema.parse({ repuestoId: "  rep-1 ", cantidad: "3" })).toEqual({
      repuestoId: "rep-1",
      cantidad: 3,
    });
  });

  it.each([
    [{ repuestoId: "  " }, "Selecciona un repuesto"],
    [{ cantidad: "0" }, "La cantidad mínima es 1"],
    [{ cantidad: "1.5" }, "La cantidad debe ser un número entero"],
    [{ cantidad: "1001" }, "La cantidad es demasiado alta"],
  ])("rechaza %o", (cambio, mensaje) => {
    const r = servicioRepuestoInputSchema.safeParse({ repuestoId: "rep-1", cantidad: "1", ...cambio });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(mensaje);
  });
});

describe("aplicarServicioInputSchema", () => {
  it("exige un servicio seleccionado y recorta el id", () => {
    expect(aplicarServicioInputSchema.parse({ servicioId: " s1 " }).servicioId).toBe("s1");
    expect(aplicarServicioInputSchema.safeParse({ servicioId: "   " }).error?.issues[0]?.message).toBe(
      "Selecciona un servicio",
    );
  });
});

describe("listarServiciosInputSchema", () => {
  it("acepta las opciones de la vista de aplicación y la ausencia de opciones", () => {
    expect(listarServiciosInputSchema.parse({ soloActivos: true })).toEqual({ soloActivos: true });
    expect(listarServiciosInputSchema.parse({})).toEqual({ soloActivos: undefined });
  });

  it("rechaza un soloActivos que no sea booleano (de él depende el rol exigido)", () => {
    expect(listarServiciosInputSchema.safeParse({ soloActivos: "true" }).success).toBe(false);
    expect(listarServiciosInputSchema.safeParse({ soloActivos: 1 }).success).toBe(false);
  });
});

describe("tope del kit", () => {
  it("acepta el máximo exacto y rechaza uno más", () => {
    expect(servicioRepuestoInputSchema.safeParse({ repuestoId: "r1", cantidad: String(CANTIDAD_MAXIMA_KIT) }).success).toBe(true);
    expect(servicioRepuestoInputSchema.safeParse({ repuestoId: "r1", cantidad: String(CANTIDAD_MAXIMA_KIT + 1) }).success).toBe(false);
  });
});
