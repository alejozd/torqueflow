import { describe, expect, it } from "vitest";
import { citaInputSchema, estadoCitaSchema } from "./cita";

describe("citaInputSchema", () => {
  it("accepts a datetime-local value and converts it to a Date", () => {
    const resultado = citaInputSchema.safeParse({
      vehiculoId: "veh-1",
      fechaHora: "2026-09-01T10:30",
      motivo: "Cambio de aceite",
      notas: "",
    });

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.fechaHora).toBeInstanceOf(Date);
      expect(resultado.data.fechaHora.getFullYear()).toBe(2026);
      expect(resultado.data.motivo).toBe("Cambio de aceite");
    }
  });

  it("parses the datetime-local value against the workshop's fixed Colombia offset, not the server's local timezone", () => {
    const resultado = citaInputSchema.safeParse({
      vehiculoId: "veh-1",
      fechaHora: "2026-09-01T10:30",
      motivo: "Cambio de aceite",
      notas: "",
    });

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      // 10:30 America/Bogota (UTC-5, no DST) is 15:30 UTC.
      expect(resultado.data.fechaHora.toISOString()).toBe("2026-09-01T15:30:00.000Z");
    }
  });

  it("rejects a missing vehiculoId with the Spanish message", () => {
    const resultado = citaInputSchema.safeParse({
      vehiculoId: "",
      fechaHora: "2026-09-01T10:30",
      motivo: "Cambio de aceite",
      notas: "",
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe("Selecciona un vehículo");
    }
  });

  it("rejects an empty fechaHora with the Spanish message", () => {
    const resultado = citaInputSchema.safeParse({
      vehiculoId: "veh-1",
      fechaHora: "",
      motivo: "Cambio de aceite",
      notas: "",
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe("La fecha y hora son obligatorias");
    }
  });

  it("rejects an unparseable fechaHora with the Spanish message", () => {
    const resultado = citaInputSchema.safeParse({
      vehiculoId: "veh-1",
      fechaHora: "no-es-una-fecha",
      motivo: "Cambio de aceite",
      notas: "",
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe("La fecha y hora no son válidas");
    }
  });

  it("rejects an empty motivo with the Spanish message", () => {
    const resultado = citaInputSchema.safeParse({
      vehiculoId: "veh-1",
      fechaHora: "2026-09-01T10:30",
      motivo: "",
      notas: "",
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe("El motivo es obligatorio");
    }
  });

  it("tolerates an empty notas, since an untouched textarea submits an empty string", () => {
    const resultado = citaInputSchema.safeParse({
      vehiculoId: "veh-1",
      fechaHora: "2026-09-01T10:30",
      motivo: "Revisión",
      notas: "",
    });

    expect(resultado.success).toBe(true);
  });
});

describe("estadoCitaSchema", () => {
  it("accepts the four valid estados", () => {
    for (const estado of ["PROGRAMADA", "CONFIRMADA", "CANCELADA", "COMPLETADA"]) {
      expect(estadoCitaSchema.safeParse(estado).success).toBe(true);
    }
  });

  it("rejects anything else, including an EstadoOrden value", () => {
    expect(estadoCitaSchema.safeParse("ENTREGADA").success).toBe(false);
    expect(estadoCitaSchema.safeParse("").success).toBe(false);
    expect(estadoCitaSchema.safeParse(null).success).toBe(false);
  });
});
