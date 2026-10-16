import { describe, expect, it } from "vitest";
import {
  diaSemana,
  diasDelMes,
  esMomentoPasado,
  formatoDiaCorto,
  formatoDiaLargo,
  formatoHora12,
  formatoMesLargo,
  horasDelDia,
  leerHoraEscrita,
  leerValorFechaHora,
  momentoBogota,
  ocupacionDeCitas,
  sumarDias,
  sumarMeses,
  tiempoRestante,
  valorFechaHora,
  valorFechaHoraDeDate,
} from "./agenda-cita";

describe("agenda-cita", () => {
  it("lee el momento en hora de Bogotá, no en UTC", () => {
    // 03:30Z del 16 es todavía el 15 a las 10:30 p. m. en Bogotá.
    expect(momentoBogota(new Date("2026-10-16T03:30:00Z"))).toEqual({ fecha: "2026-10-15", minutos: 22 * 60 + 30 });
    expect(valorFechaHoraDeDate(new Date("2026-09-01T15:30:00Z"))).toBe("2026-09-01T10:30");
  });

  it("arma y lee el valor que espera citaInputSchema", () => {
    expect(valorFechaHora("2026-10-17", 14 * 60)).toBe("2026-10-17T14:00");
    expect(valorFechaHora("2026-10-17", 7 * 60 + 5)).toBe("2026-10-17T07:05");
    expect(leerValorFechaHora("2026-10-17T10:15")).toEqual({ fecha: "2026-10-17", minutos: 615 });
    expect(leerValorFechaHora("")).toBeNull();
    expect(leerValorFechaHora("2026-10-17")).toBeNull();
  });

  it("suma días y meses cruzando mes y año", () => {
    expect(sumarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(sumarMeses("2026-12", 1)).toBe("2027-01");
    expect(sumarMeses("2026-01", -1)).toBe("2025-12");
    expect(diasDelMes("2028-02")).toBe(29);
    expect(diaSemana("2026-10-15")).toBe(4);
  });

  it("formatea en español de Colombia", () => {
    expect(formatoHora12(0)).toBe("12:00 a. m.");
    expect(formatoHora12(7 * 60)).toBe("7:00 a. m.");
    expect(formatoHora12(12 * 60)).toBe("12:00 p. m.");
    expect(formatoHora12(15 * 60 + 30)).toBe("3:30 p. m.");
    expect(formatoDiaLargo("2026-10-16")).toBe("viernes 16 de octubre");
    expect(formatoDiaCorto("2026-10-16")).toBe("vie 16 oct");
    expect(formatoMesLargo("2026-10")).toBe("octubre de 2026");
  });

  it("ofrece las horas desde la apertura hasta antes del cierre", () => {
    expect(horasDelDia(7 * 60, 9 * 60, 30)).toEqual([420, 450, 480, 510]);
  });

  it("marca como pasadas las horas de hoy que ya llegaron", () => {
    const ahora = { fecha: "2026-10-15", minutos: 10 * 60 };
    expect(esMomentoPasado("2026-10-15", 10 * 60, ahora)).toBe(true);
    expect(esMomentoPasado("2026-10-15", 10 * 60 + 30, ahora)).toBe(false);
    expect(esMomentoPasado("2026-10-14", 23 * 60, ahora)).toBe(true);
    expect(esMomentoPasado("2026-10-16", 0, ahora)).toBe(false);
  });

  it("entiende la hora escrita a mano", () => {
    expect(leerHoraEscrita("10:15")).toBe(615);
    expect(leerHoraEscrita("15:45")).toBe(945);
    expect(leerHoraEscrita("3:45 pm")).toBe(945);
    expect(leerHoraEscrita("3:45 p. m.")).toBe(945);
    expect(leerHoraEscrita("3")).toBe(15 * 60);
    expect(leerHoraEscrita("8")).toBe(8 * 60);
    expect(leerHoraEscrita("12 am")).toBe(0);
    expect(leerHoraEscrita("3 de la tarde")).toBe(15 * 60);
    expect(leerHoraEscrita("9 de la mañana")).toBe(9 * 60);
    expect(leerHoraEscrita("25:00")).toBeNull();
    expect(leerHoraEscrita("mañana")).toBeNull();
  });

  it("arma la ocupación sin canceladas, sin la cita editada y sin días pasados", () => {
    const cita = (id: string, iso: string, estado = "PROGRAMADA") => ({
      id,
      fechaHora: new Date(iso),
      estado,
      motivo: `Motivo ${id}`,
      vehiculo: { placa: `PLA${id}` },
    });
    const ocupacion = ocupacionDeCitas(
      [
        cita("1", "2026-10-16T19:00:00Z"),
        cita("2", "2026-10-16T13:00:00Z"),
        cita("3", "2026-10-16T14:00:00Z", "CANCELADA"),
        cita("4", "2026-10-17T14:00:00Z"),
        cita("5", "2026-10-14T14:00:00Z"),
      ],
      { desde: "2026-10-15", excluirId: "4" },
    );
    expect(ocupacion).toEqual([
      { fecha: "2026-10-16", minutos: 8 * 60, placa: "PLA2", motivo: "Motivo 2" },
      { fecha: "2026-10-16", minutos: 14 * 60, placa: "PLA1", motivo: "Motivo 1" },
    ]);
  });
});

describe("tiempoRestante", () => {
  const ahora = new Date("2026-10-15T13:05:00-05:00");
  const en = (min: number) => new Date(ahora.getTime() + min * 60000);

  it("dice los minutos cuando falta menos de una hora", () => {
    expect(tiempoRestante(ahora, en(25))).toBe("en 25 min");
  });

  it("dice horas y minutos cuando falta más", () => {
    expect(tiempoRestante(ahora, en(180))).toBe("en 3 h");
    expect(tiempoRestante(ahora, en(195))).toBe("en 3 h 15 min");
  });

  it("dice ahora en el mismo minuto y null si ya pasó", () => {
    expect(tiempoRestante(ahora, en(0))).toBe("ahora");
    expect(tiempoRestante(ahora, en(-10))).toBeNull();
  });
});
