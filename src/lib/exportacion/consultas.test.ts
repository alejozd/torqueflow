import { describe, expect, it, vi } from "vitest";
import { arqueosDelRango, ventasDelRango } from "./consultas";
import type { RangoExportacion } from "./rango-fechas";

const RANGO: RangoExportacion = {
  desde: "2026-10-01",
  hasta: "2026-10-17",
  gte: new Date("2026-10-01T05:00:00Z"),
  lt: new Date("2026-10-18T05:00:00Z"),
};

describe("ventasDelRango", () => {
  it("filtra por la sede y el rango, y convierte los montos", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        numero: 7,
        createdAt: new Date("2026-10-05T15:00:00Z"),
        total: { toString: () => "59500.00" },
        saldoPendiente: { toString: () => "0" },
        estado: "PAGADA",
        cliente: null,
        items: [{ cantidad: 2, descripcion: "Filtro" }],
      },
    ]);
    const db = { ventaMostrador: { findMany } } as never;

    const ventas = await ventasDelRango(db, "sede-1", RANGO);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sedeId: "sede-1", createdAt: { gte: RANGO.gte, lt: RANGO.lt } } }),
    );
    expect(ventas).toEqual([
      {
        numero: 7,
        createdAt: new Date("2026-10-05T15:00:00Z"),
        clienteNombre: null,
        total: 59500,
        saldoPendiente: 0,
        estado: "PAGADA",
        items: [{ cantidad: 2, descripcion: "Filtro" }],
      },
    ]);
  });
});

describe("arqueosDelRango", () => {
  it("toma las cajas cerradas de la sede abiertas dentro del rango", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "c1",
        abiertaAt: new Date("2026-10-05T13:00:00Z"),
        cerradaAt: new Date("2026-10-05T22:00:00Z"),
        baseInicial: 100000,
        efectivoEsperado: 250000,
        efectivoContado: 240000,
        notas: null,
        abiertaPor: { nombre: "Ana" },
        cerradaPor: { nombre: "Luis" },
      },
    ]);
    const db = { cajaSesion: { findMany } } as never;

    const filas = await arqueosDelRango(db, "sede-1", RANGO);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sedeId: "sede-1", cerradaAt: { not: null }, abiertaAt: { gte: RANGO.gte, lt: RANGO.lt } },
      }),
    );
    expect(filas).toEqual([
      expect.objectContaining({ id: "c1", abrioPorNombre: "Ana", cerroPorNombre: "Luis", diferencia: -10000, tipo: "FALTANTE" }),
    ]);
  });
});
