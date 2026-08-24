import { describe, expect, it } from "vitest";
import {
  COOLDOWN_RECORDATORIO_DIAS,
  UMBRAL_KM,
  UMBRAL_MESES,
  evaluarMantenimiento,
  sumarMeses,
  type LecturaServicio,
} from "./mantenimiento";

const d = (iso: string) => new Date(iso);

describe("constantes globales", () => {
  it("fixes the thresholds in code, not per tenant", () => {
    expect(UMBRAL_KM).toBe(5000);
    expect(UMBRAL_MESES).toBe(6);
    expect(COOLDOWN_RECORDATORIO_DIAS).toBe(90);
  });
});

describe("sumarMeses", () => {
  it("adds whole months", () => {
    expect(sumarMeses(d("2026-01-15T00:00:00Z"), 6).toISOString()).toBe("2026-07-15T00:00:00.000Z");
  });

  it("clamps to the last day of the target month instead of rolling over", () => {
    expect(sumarMeses(d("2025-08-31T00:00:00Z"), 6).toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("does not mutate its argument", () => {
    const original = d("2026-01-15T00:00:00Z");
    sumarMeses(original, 6);
    expect(original.toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });
});

describe("evaluarMantenimiento", () => {
  it("is never due for a vehicle with no delivered service on record", () => {
    expect(evaluarMantenimiento([], null, d("2026-08-21T00:00:00Z"))).toEqual({
      vencido: false,
      motivo: null,
      fechaVencimiento: null,
      bloqueadoPorCooldown: false,
    });
  });

  it("is not due five months after the only service, with no km data", () => {
    const servicios: LecturaServicio[] = [{ fecha: d("2026-03-21T00:00:00Z"), kilometraje: null }];

    const resultado = evaluarMantenimiento(servicios, null, d("2026-08-21T00:00:00Z"));

    expect(resultado.vencido).toBe(false);
    expect(resultado.fechaVencimiento?.toISOString()).toBe("2026-09-21T00:00:00.000Z");
  });

  it("is due on the TIEMPO threshold six months after the only service", () => {
    const servicios: LecturaServicio[] = [{ fecha: d("2026-02-21T00:00:00Z"), kilometraje: null }];

    const resultado = evaluarMantenimiento(servicios, null, d("2026-08-21T00:00:00Z"));

    expect(resultado.vencido).toBe(true);
    expect(resultado.motivo).toBe("TIEMPO");
  });

  it("ignores the km branch when only one reading exists, since no rate can be derived", () => {
    const servicios: LecturaServicio[] = [{ fecha: d("2026-08-01T00:00:00Z"), kilometraje: 60000 }];

    const resultado = evaluarMantenimiento(servicios, null, d("2026-08-21T00:00:00Z"));

    expect(resultado.vencido).toBe(false);
    expect(resultado.motivo).toBe(null);
  });

  it("is due on KILOMETRAJE when the projected distance reaches 5000 km before six months pass", () => {
    // 5000 km in 100 days => 50 km/día. 5000 more km => 100 days after the last
    // service (2026-05-01), i.e. 2026-08-09 -- well before the 6-month date.
    const servicios: LecturaServicio[] = [
      { fecha: d("2026-05-01T00:00:00Z"), kilometraje: 65000 },
      { fecha: d("2026-01-21T00:00:00Z"), kilometraje: 60000 },
    ];

    const resultado = evaluarMantenimiento(servicios, null, d("2026-08-21T00:00:00Z"));

    expect(resultado.vencido).toBe(true);
    expect(resultado.motivo).toBe("KILOMETRAJE");
    expect(resultado.fechaVencimiento?.toISOString().slice(0, 10)).toBe("2026-08-09");
  });

  it("is not yet due when the projected 5000 km lie in the future and six months have not passed", () => {
    const servicios: LecturaServicio[] = [
      { fecha: d("2026-08-01T00:00:00Z"), kilometraje: 65000 },
      { fecha: d("2026-04-23T00:00:00Z"), kilometraje: 60000 },
    ];

    const resultado = evaluarMantenimiento(servicios, null, d("2026-08-21T00:00:00Z"));

    expect(resultado.vencido).toBe(false);
    expect(resultado.motivo).toBe(null);
  });

  it("picks whichever threshold comes FIRST when both eventually fire", () => {
    // 500 km in 100 days => 5 km/día => 1000 days to reach 5000 km, far later
    // than the 6-month date. TIEMPO must win.
    const servicios: LecturaServicio[] = [
      { fecha: d("2026-02-01T00:00:00Z"), kilometraje: 60500 },
      { fecha: d("2025-10-24T00:00:00Z"), kilometraje: 60000 },
    ];

    const resultado = evaluarMantenimiento(servicios, null, d("2026-08-21T00:00:00Z"));

    expect(resultado.vencido).toBe(true);
    expect(resultado.motivo).toBe("TIEMPO");
  });

  it("ignores a non-positive or zero km rate instead of dividing by it", () => {
    const sinAvance: LecturaServicio[] = [
      { fecha: d("2026-08-01T00:00:00Z"), kilometraje: 60000 },
      { fecha: d("2026-04-23T00:00:00Z"), kilometraje: 60000 },
    ];
    const retrocede: LecturaServicio[] = [
      { fecha: d("2026-08-01T00:00:00Z"), kilometraje: 59000 },
      { fecha: d("2026-04-23T00:00:00Z"), kilometraje: 60000 },
    ];

    expect(evaluarMantenimiento(sinAvance, null, d("2026-08-21T00:00:00Z")).motivo).toBe(null);
    expect(evaluarMantenimiento(retrocede, null, d("2026-08-21T00:00:00Z")).motivo).toBe(null);
  });

  it("ignores the km branch when either reading has no kilometraje recorded", () => {
    const servicios: LecturaServicio[] = [
      { fecha: d("2026-05-01T00:00:00Z"), kilometraje: 65000 },
      { fecha: d("2026-01-21T00:00:00Z"), kilometraje: null },
    ];

    expect(evaluarMantenimiento(servicios, null, d("2026-08-21T00:00:00Z")).motivo).toBe(null);
  });

  it("ignores the km branch when both readings share the same day, avoiding a divide-by-zero", () => {
    const servicios: LecturaServicio[] = [
      { fecha: d("2026-05-01T10:00:00Z"), kilometraje: 65000 },
      { fecha: d("2026-05-01T08:00:00Z"), kilometraje: 60000 },
    ];

    expect(evaluarMantenimiento(servicios, null, d("2026-08-21T00:00:00Z")).motivo).toBe(null);
  });

  it("flags the cooldown when a reminder went out less than 90 days ago, while staying due", () => {
    const servicios: LecturaServicio[] = [{ fecha: d("2026-02-21T00:00:00Z"), kilometraje: null }];

    const resultado = evaluarMantenimiento(servicios, d("2026-07-21T00:00:00Z"), d("2026-08-21T00:00:00Z"));

    expect(resultado.vencido).toBe(true);
    expect(resultado.bloqueadoPorCooldown).toBe(true);
  });

  it("clears the cooldown once more than 90 days have passed", () => {
    const servicios: LecturaServicio[] = [{ fecha: d("2026-02-21T00:00:00Z"), kilometraje: null }];

    const resultado = evaluarMantenimiento(servicios, d("2026-01-21T00:00:00Z"), d("2026-08-21T00:00:00Z"));

    expect(resultado.vencido).toBe(true);
    expect(resultado.bloqueadoPorCooldown).toBe(false);
  });
});
