import { describe, expect, it } from "vitest";
import {
  MOTIVO_CAJA_CERRADA,
  MOTIVO_FUERA_DE_PLAZO,
  puedeDevolver,
  ventaEnCajaCerrada,
} from "./plazo-devolucion";

const AHORA = new Date("2026-10-17T18:00:00Z"); // 13:00 en Bogotá
const MS_DIA = 24 * 60 * 60 * 1000;

describe("puedeDevolver", () => {
  it("dentro del plazo y con la caja abierta, cualquiera devuelve", () => {
    expect(puedeDevolver({ fechaVenta: new Date(AHORA.getTime() - MS_DIA), ahora: AHORA, rol: "RECEPCION", cajaCerrada: false })).toEqual({
      permitido: true,
      motivo: null,
    });
  });

  it("justo a los 30 días todavía se puede; un minuto después ya no, ni siquiera ADMIN", () => {
    const limite = new Date(AHORA.getTime() - 30 * MS_DIA);
    expect(puedeDevolver({ fechaVenta: limite, ahora: AHORA, rol: "RECEPCION", cajaCerrada: false }).permitido).toBe(true);

    const pasada = new Date(limite.getTime() - 60 * 1000);
    expect(puedeDevolver({ fechaVenta: pasada, ahora: AHORA, rol: "ADMIN", cajaCerrada: false })).toEqual({
      permitido: false,
      motivo: MOTIVO_FUERA_DE_PLAZO,
    });
  });

  it("de una caja cerrada solo devuelve ADMIN", () => {
    const fechaVenta = new Date(AHORA.getTime() - 3 * MS_DIA);
    expect(puedeDevolver({ fechaVenta, ahora: AHORA, rol: "RECEPCION", cajaCerrada: true })).toEqual({
      permitido: false,
      motivo: MOTIVO_CAJA_CERRADA,
    });
    expect(puedeDevolver({ fechaVenta, ahora: AHORA, rol: "ADMIN", cajaCerrada: true })).toEqual({
      permitido: true,
      motivo: null,
    });
  });
});

describe("ventaEnCajaCerrada", () => {
  const fechaVenta = new Date("2026-10-17T15:00:00Z");

  it("con control de caja: sin ningún cierre (o sin caja abierta) no es caja cerrada", () => {
    expect(ventaEnCajaCerrada({ fechaVenta, ahora: AHORA, usarControlCaja: true, ultimoCierreCaja: null })).toBe(false);
  });

  it("con control de caja: un cierre antes de la venta no la toca; uno después sí (ya hizo arqueo)", () => {
    const antes = new Date("2026-10-17T13:00:00Z");
    const despues = new Date("2026-10-17T16:00:00Z");
    expect(ventaEnCajaCerrada({ fechaVenta, ahora: AHORA, usarControlCaja: true, ultimoCierreCaja: antes })).toBe(false);
    expect(ventaEnCajaCerrada({ fechaVenta, ahora: AHORA, usarControlCaja: true, ultimoCierreCaja: despues })).toBe(true);
  });

  it("con control de caja no importa el día: una venta de ayer sin cierre posterior sigue abierta", () => {
    const ventaDeAyer = new Date("2026-10-16T22:00:00Z");
    const cierreAnterior = new Date("2026-10-16T20:00:00Z");
    expect(
      ventaEnCajaCerrada({ fechaVenta: ventaDeAyer, ahora: AHORA, usarControlCaja: true, ultimoCierreCaja: cierreAnterior }),
    ).toBe(false);
  });

  it("sin control de caja: el mismo día de Bogotá no es caja cerrada, un día anterior sí", () => {
    // 23:59 del 16 en Bogotá = 04:59Z del 17; "ahora" es 00:01 del 17 en Bogotá (05:01Z).
    const ultimoMinutoDeAyer = new Date("2026-10-17T04:59:00Z");
    const primerMinutoDeHoy = new Date("2026-10-17T05:00:00Z");
    const ahora = new Date("2026-10-17T05:01:00Z");
    expect(
      ventaEnCajaCerrada({ fechaVenta: ultimoMinutoDeAyer, ahora, usarControlCaja: false, ultimoCierreCaja: null }),
    ).toBe(true);
    expect(
      ventaEnCajaCerrada({ fechaVenta: primerMinutoDeHoy, ahora, usarControlCaja: false, ultimoCierreCaja: null }),
    ).toBe(false);
  });

  it("sin control de caja ignora los cierres", () => {
    expect(
      ventaEnCajaCerrada({ fechaVenta, ahora: AHORA, usarControlCaja: false, ultimoCierreCaja: new Date("2026-10-17T16:00:00Z") }),
    ).toBe(false);
  });
});
