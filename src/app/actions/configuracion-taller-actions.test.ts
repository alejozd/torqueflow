import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequirePermiso = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requirePermiso: (...args: unknown[]) => mockRequirePermiso(...args),
  requireSession: vi.fn(),
}));
const mockUpsert = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({ configuracionTaller: { upsert: mockUpsert, findUnique: vi.fn() } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  guardarDiasAvisoAction,
  guardarDiasEstancadaAction,
  guardarOpcionesTallerAction,
} from "./configuracion-taller-actions";

const inicial = { error: null, success: false };

describe("guardarDiasAvisoAction", () => {
  beforeEach(() => {
    mockRequirePermiso.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockUpsert.mockReset().mockResolvedValue({});
  });

  it("exige ADMIN", async () => {
    const fd = new FormData();
    fd.set("diasAvisoVencimiento", "15");
    await guardarDiasAvisoAction(inicial, fd);
    expect(mockRequirePermiso).toHaveBeenCalledWith("configuracion.taller");
  });

  it("guarda con upsert sobre el singleton", async () => {
    const fd = new FormData();
    fd.set("diasAvisoVencimiento", "15");
    const r = await guardarDiasAvisoAction(inicial, fd);
    expect(r).toEqual({ error: null, success: true });
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { id: "singleton" },
      create: { id: "singleton", diasAvisoVencimiento: 15 },
      update: { diasAvisoVencimiento: 15 },
    });
  });

  it("devuelve un error amigable si el upsert falla", async () => {
    mockUpsert.mockRejectedValue(new Error("db down"));
    const fd = new FormData();
    fd.set("diasAvisoVencimiento", "15");
    const r = await guardarDiasAvisoAction(inicial, fd);
    expect(r).toEqual({ error: "No se pudo guardar la configuración", success: false });
  });

  it.each(["0", "91", "abc", ""])("rechaza %s", async (valor) => {
    const fd = new FormData();
    fd.set("diasAvisoVencimiento", valor);
    const r = await guardarDiasAvisoAction(inicial, fd);
    expect(r.success).toBe(false);
    expect(r.error).toBe("Ingresa un número de días entre 1 y 90");
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe("guardarDiasEstancadaAction", () => {
  beforeEach(() => {
    mockRequirePermiso.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockUpsert.mockReset().mockResolvedValue({});
  });

  it("exige ADMIN y guarda el umbral en el singleton", async () => {
    const fd = new FormData();
    fd.set("diasOrdenEstancada", "5");

    const r = await guardarDiasEstancadaAction(inicial, fd);

    expect(r).toEqual({ error: null, success: true });
    expect(mockRequirePermiso).toHaveBeenCalledWith("configuracion.taller");
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { id: "singleton" },
      create: { id: "singleton", diasOrdenEstancada: 5 },
      update: { diasOrdenEstancada: 5 },
    });
  });

  it.each(["0", "91", "abc", "", "2.5"])("rechaza %s", async (valor) => {
    const fd = new FormData();
    fd.set("diasOrdenEstancada", valor);

    const r = await guardarDiasEstancadaAction(inicial, fd);

    expect(r.success).toBe(false);
    expect(r.error).toBe("Ingresa un número de días entre 1 y 90");
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("devuelve un error amigable si el upsert falla", async () => {
    mockUpsert.mockRejectedValue(new Error("db down"));
    const fd = new FormData();
    fd.set("diasOrdenEstancada", "5");

    const r = await guardarDiasEstancadaAction(inicial, fd);

    expect(r).toEqual({ error: "No se pudo guardar la configuración", success: false });
  });
});

describe("guardarOpcionesTallerAction", () => {
  beforeEach(() => {
    mockRequirePermiso.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockUpsert.mockReset().mockResolvedValue({});
  });

  it("exige ADMIN y guarda las dos opciones encendidas", async () => {
    const fd = new FormData();
    fd.set("exigirActaFirmada", "true");
    fd.set("usarControlCaja", "true");
    fd.set("descuentoMaxRecepcion", "15");

    const r = await guardarOpcionesTallerAction(inicial, fd);

    expect(r).toEqual({ error: null, success: true });
    expect(mockRequirePermiso).toHaveBeenCalledWith("configuracion.taller");
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { id: "singleton" },
      create: { id: "singleton", exigirActaFirmada: true, usarControlCaja: true, descuentoMaxRecepcion: 15 },
      update: { exigirActaFirmada: true, usarControlCaja: true, descuentoMaxRecepcion: 15 },
    });
  });

  it("una casilla sin marcar no viaja en el formulario y se guarda apagada", async () => {
    const fd = new FormData();
    fd.set("usarControlCaja", "true");
    fd.set("descuentoMaxRecepcion", "10");

    await guardarOpcionesTallerAction(inicial, fd);

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { exigirActaFirmada: false, usarControlCaja: true, descuentoMaxRecepcion: 10 } }),
    );
  });

  it("solo 'true' enciende una opción", async () => {
    const fd = new FormData();
    fd.set("exigirActaFirmada", "si");
    fd.set("usarControlCaja", "1");
    fd.set("descuentoMaxRecepcion", "0");

    await guardarOpcionesTallerAction(inicial, fd);

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { exigirActaFirmada: false, usarControlCaja: false, descuentoMaxRecepcion: 0 } }),
    );
  });

  it.each(["", "-1", "101", "10.5", "abc"])("rechaza el tope %j y no guarda nada", async (valor) => {
    const fd = new FormData();
    fd.set("descuentoMaxRecepcion", valor);

    const r = await guardarOpcionesTallerAction(inicial, fd);

    expect(r).toEqual({ error: "Ingresa un porcentaje entero entre 0 y 100", success: false });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("sin el campo en el formulario rechaza en vez de leerlo como 0", async () => {
    const r = await guardarOpcionesTallerAction(inicial, new FormData());

    expect(r.success).toBe(false);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("acepta los extremos 0 y 100", async () => {
    for (const v of ["0", "100"]) {
      const fd = new FormData();
      fd.set("descuentoMaxRecepcion", v);
      expect((await guardarOpcionesTallerAction(inicial, fd)).success).toBe(true);
    }
  });

  it("devuelve un error amigable si el upsert falla", async () => {
    mockUpsert.mockRejectedValue(new Error("db down"));

    const fd = new FormData();
    fd.set("descuentoMaxRecepcion", "10");
    const r = await guardarOpcionesTallerAction(inicial, fd);

    expect(r).toEqual({ error: "No se pudo guardar la configuración", success: false });
  });
});
