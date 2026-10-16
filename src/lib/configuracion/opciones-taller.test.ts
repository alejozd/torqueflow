import { describe, expect, it, vi } from "vitest";
import { OPCIONES_TALLER_POR_DEFECTO, leerOpcionesTaller } from "./opciones-taller";

function lector(fila: unknown) {
  const findUnique = vi.fn().mockResolvedValue(fila);
  return { db: { configuracionTaller: { findUnique } } as never, findUnique };
}

describe("leerOpcionesTaller", () => {
  it("sin fila usa los valores por defecto: las dos opciones apagadas y el tope de recepción en 10", async () => {
    const { db } = lector(null);

    await expect(leerOpcionesTaller(db)).resolves.toEqual({ exigirActaFirmada: false, usarControlCaja: false, descuentoMaxRecepcion: 10 });
    expect(OPCIONES_TALLER_POR_DEFECTO).toEqual({ exigirActaFirmada: false, usarControlCaja: false, descuentoMaxRecepcion: 10 });
  });

  it("devuelve lo guardado en el singleton", async () => {
    const { db, findUnique } = lector({ exigirActaFirmada: true, usarControlCaja: true, descuentoMaxRecepcion: 25 });

    await expect(leerOpcionesTaller(db)).resolves.toEqual({ exigirActaFirmada: true, usarControlCaja: true, descuentoMaxRecepcion: 25 });
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "singleton" },
      select: { exigirActaFirmada: true, usarControlCaja: true, descuentoMaxRecepcion: true },
    });
  });
});
