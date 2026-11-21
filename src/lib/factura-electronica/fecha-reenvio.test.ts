import { describe, expect, it } from "vitest";
import type { FacturaVenta } from "@/modulos/factura-electronica";
import { conFechaDeReenvio } from "./fecha-reenvio";

const base = {
  tipo: "FACTURA",
  prefijo: "SETP",
  numero: 7,
  fecha: "2026-11-20",
  hora: "10:00:00",
  resolucionNumero: "1",
  adquirente: { tipo: "CONSUMIDOR_FINAL" },
  lineas: [],
  pago: { forma: "CONTADO", medio: "10", vencimiento: "2026-11-20" },
  enviarCorreo: false,
} as FacturaVenta;

describe("conFechaDeReenvio", () => {
  it("el mismo día devuelve el mismo documento (fecha congelada)", () => {
    expect(conFechaDeReenvio(base, { fecha: "2026-11-20", hora: "18:00:00" })).toBe(base);
  });

  it("otro día cambia fecha y hora y, de contado, el vencimiento queda en la fecha nueva", () => {
    const r = conFechaDeReenvio(base, { fecha: "2026-11-23", hora: "08:30:00" });
    expect(r).not.toBe(base);
    expect(r).toMatchObject({ fecha: "2026-11-23", hora: "08:30:00", numero: 7, prefijo: "SETP", pago: { vencimiento: "2026-11-23" } });
  });

  it("a crédito conserva el plazo en días", () => {
    const credito = { ...base, pago: { forma: "CREDITO", medio: "10", vencimiento: "2026-12-20" } } as FacturaVenta;
    expect(conFechaDeReenvio(credito, { fecha: "2026-11-23", hora: "08:30:00" }).pago.vencimiento).toBe("2026-12-23");
  });
});
