import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockCreate = vi.fn();
const mockCotizacionFindFirst = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    cotizacionSeguimiento: { create: mockCreate },
    cotizacion: { findFirst: mockCotizacionFindFirst },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  registrarSeguimientoAction,
  type SeguimientoCotizacionFormState,
} from "./cotizacion-seguimiento-actions";

const initialState: SeguimientoCotizacionFormState = { error: null, success: false };
const SESSION = { user: { id: "u1", role: "TECNICO", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };

describe("registrarSeguimientoAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION);
    mockCreate.mockReset();
    mockCotizacionFindFirst.mockReset().mockResolvedValue({ id: "c1" });
  });

  it("returns a validation error when tipo is missing", async () => {
    const formData = new FormData();
    formData.set("fecha", "2026-09-05T10:30");
    formData.set("resultado", "Cliente no contestó");

    const result = await registrarSeguimientoAction("c1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Selecciona el tipo de seguimiento");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns a validation error when fecha is blank", async () => {
    const formData = new FormData();
    formData.set("tipo", "LLAMADA");
    formData.set("fecha", "");
    formData.set("resultado", "Cliente no contestó");

    const result = await registrarSeguimientoAction("c1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("La fecha es obligatoria");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns a validation error when resultado is blank", async () => {
    const formData = new FormData();
    formData.set("tipo", "LLAMADA");
    formData.set("fecha", "2026-09-05T10:30");
    formData.set("resultado", "");

    const result = await registrarSeguimientoAction("c1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("El resultado es obligatorio");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the seguimiento linked to the given cotizacionId on valid input, without proximoSeguimiento", async () => {
    mockCreate.mockResolvedValue({ id: "s1" });
    const formData = new FormData();
    formData.set("tipo", "LLAMADA");
    formData.set("fecha", "2026-09-05T10:30");
    formData.set("resultado", "Cliente no contestó, reintentar mañana");

    const result = await registrarSeguimientoAction("c1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        cotizacionId: "c1",
        tipo: "LLAMADA",
        fecha: new Date("2026-09-05T10:30:00-05:00"),
        resultado: "Cliente no contestó, reintentar mañana",
        proximoSeguimiento: null,
        creadoPorId: "u1",
      },
    });
  });

  it("passes proximoSeguimiento through when provided", async () => {
    mockCreate.mockResolvedValue({ id: "s1" });
    const formData = new FormData();
    formData.set("tipo", "WHATSAPP");
    formData.set("fecha", "2026-09-05T10:30");
    formData.set("resultado", "Confirmó que revisará la cotización");
    formData.set("proximoSeguimiento", "2026-09-10");

    const result = await registrarSeguimientoAction("c1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        cotizacionId: "c1",
        tipo: "WHATSAPP",
        fecha: new Date("2026-09-05T10:30:00-05:00"),
        resultado: "Confirmó que revisará la cotización",
        proximoSeguimiento: new Date("2026-09-10"),
        creadoPorId: "u1",
      },
    });
  });

  it("requires ADMIN/RECEPCION/TECNICO to register a seguimiento", async () => {
    mockCreate.mockResolvedValue({ id: "s1" });
    const formData = new FormData();
    formData.set("tipo", "NOTA");
    formData.set("fecha", "2026-09-05T10:30");
    formData.set("resultado", "Nota interna");

    await registrarSeguimientoAction("c1", initialState, formData);

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION", "TECNICO"]);
  });

  it("refuses to touch a cotización from another sede", async () => {
    mockCotizacionFindFirst.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("tipo", "VISITA");
    formData.set("fecha", "2026-09-05T10:30");
    formData.set("resultado", "Visita al taller");

    const result = await registrarSeguimientoAction("cotizacion-de-otra-sede", initialState, formData);

    expect(result).toEqual({ error: "Cotización no encontrada", success: false });
    expect(mockCotizacionFindFirst).toHaveBeenCalledWith({
      where: { id: "cotizacion-de-otra-sede", sedeId: "sede-1" },
      select: { id: true },
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
