import { describe, expect, it, vi } from "vitest";
import { exigirCajaParaEfectivo, ultimoCierreDeCaja } from "./sesion";

function db({ usarControlCaja, abierta }: { usarControlCaja: boolean | null; abierta: boolean }) {
  return {
    configuracionTaller: {
      findUnique: vi
        .fn()
        .mockResolvedValue(usarControlCaja === null ? null : { exigirActaFirmada: false, usarControlCaja }),
    },
    cajaSesion: {
      findFirst: vi.fn().mockResolvedValue(abierta ? { id: "c1", abiertaAt: new Date() } : null),
    },
  };
}

const MENSAJE = "Abre la caja antes de cobrar";

describe("exigirCajaParaEfectivo", () => {
  it("con el control de caja apagado no exige nada, ni siquiera en efectivo", async () => {
    const lector = db({ usarControlCaja: false, abierta: false });

    await expect(exigirCajaParaEfectivo(lector as never, "sede-1", "EFECTIVO", MENSAJE)).resolves.toBeNull();
    expect(lector.cajaSesion.findFirst).not.toHaveBeenCalled();
  });

  it("un taller sin configuración guardada tiene el control apagado", async () => {
    const lector = db({ usarControlCaja: null, abierta: false });

    await expect(exigirCajaParaEfectivo(lector as never, "sede-1", "EFECTIVO", MENSAJE)).resolves.toBeNull();
  });

  it("con el control encendido, un método que no es efectivo no toca el cajón", async () => {
    const lector = db({ usarControlCaja: true, abierta: false });

    for (const metodo of ["TARJETA", "TRANSFERENCIA", "OTRO"] as const) {
      await expect(exigirCajaParaEfectivo(lector as never, "sede-1", metodo, MENSAJE)).resolves.toBeNull();
    }
    expect(lector.configuracionTaller.findUnique).not.toHaveBeenCalled();
    expect(lector.cajaSesion.findFirst).not.toHaveBeenCalled();
  });

  it("con el control encendido, el efectivo exige la caja abierta de la sede", async () => {
    const cerrada = db({ usarControlCaja: true, abierta: false });
    await expect(exigirCajaParaEfectivo(cerrada as never, "sede-1", "EFECTIVO", MENSAJE)).resolves.toBe(MENSAJE);
    expect(cerrada.cajaSesion.findFirst).toHaveBeenCalledWith({
      where: { sedeId: "sede-1", cerradaAt: null },
      select: { id: true, abiertaAt: true },
    });

    const abierta = db({ usarControlCaja: true, abierta: true });
    await expect(exigirCajaParaEfectivo(abierta as never, "sede-1", "EFECTIVO", MENSAJE)).resolves.toBeNull();
  });

  it("acepta un booleano para los caminos que ya saben si es efectivo (gasto)", async () => {
    const lector = db({ usarControlCaja: true, abierta: false });

    await expect(exigirCajaParaEfectivo(lector as never, "sede-1", false, MENSAJE)).resolves.toBeNull();
    await expect(exigirCajaParaEfectivo(lector as never, "sede-1", true, MENSAJE)).resolves.toBe(MENSAJE);
  });
});

describe("ultimoCierreDeCaja", () => {
  it("busca el cierre más reciente de la sede, o solo uno posterior a una fecha", async () => {
    const cierre = new Date("2026-10-17T23:00:00Z");
    const lector = { cajaSesion: { findFirst: vi.fn().mockResolvedValue({ cerradaAt: cierre }) } };

    await expect(ultimoCierreDeCaja(lector as never, "sede-1")).resolves.toEqual(cierre);
    expect(lector.cajaSesion.findFirst).toHaveBeenLastCalledWith({
      where: { sedeId: "sede-1", cerradaAt: { not: null } },
      select: { cerradaAt: true },
      orderBy: { cerradaAt: "desc" },
    });

    const venta = new Date("2026-10-17T15:00:00Z");
    await ultimoCierreDeCaja(lector as never, "sede-1", venta);
    expect(lector.cajaSesion.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { sedeId: "sede-1", cerradaAt: { gt: venta } } }),
    );

    lector.cajaSesion.findFirst.mockResolvedValue(null);
    await expect(ultimoCierreDeCaja(lector as never, "sede-1")).resolves.toBeNull();
  });
});
