import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockCreate = vi.fn();
const mockFindMany = vi.fn();
const mockOrdenFindFirst = vi.fn();
const mockUpdate = vi.fn();
const mockSedeFindFirst = vi.fn();
const mockUsuarioFindMany = vi.fn();
const mockConfiguracionSmtpFindUnique = vi.fn();
const mockNotificacionCreate = vi.fn();
const mockVehiculoFindUnique = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    ordenTrabajo: {
      create: mockCreate,
      findMany: mockFindMany,
      findFirst: mockOrdenFindFirst,
      update: mockUpdate,
    },
    sede: { findFirst: mockSedeFindFirst },
    usuario: { findMany: mockUsuarioFindMany },
    vehiculo: { findUnique: mockVehiculoFindUnique },
    configuracionSmtp: { findUnique: mockConfiguracionSmtpFindUnique },
    notificacionOrdenEnviada: { create: mockNotificacionCreate },
  }),
}));

const mockEnviarEmail = vi.fn();
vi.mock("@/lib/email/enviar-email", () => ({
  enviarEmail: (...args: unknown[]) => mockEnviarEmail(...args),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { cifrarSecreto } from "@/lib/crypto/secret-box";
import {
  createOrdenAction,
  createOrdenDesdeVehiculoAction,
  listOrdenes,
  listOrdenesByVehiculo,
  getOrden,
  listTecnicos,
  updateEstadoOrdenAction,
  type OrdenFormState,
  type EstadoFormState,
} from "./orden-actions";

const initialState: OrdenFormState = { error: null, success: false };
const SESSION = {
  user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez", sedeActivaId: "sede-1" },
};

describe("createOrdenAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION);
    mockCreate.mockReset();
    mockSedeFindFirst.mockReset();
  });

  it("returns a validation error for a negative kilometraje", async () => {
    const formData = new FormData();
    formData.set("kilometrajeIngreso", "-5");

    const result = await createOrdenAction("c1", "v1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("El kilometraje no puede ser negativo");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the order in the session's sede activa, never looking up a default sede", async () => {
    mockCreate.mockResolvedValue({ id: "o1" });
    const formData = new FormData();
    formData.set("kilometrajeIngreso", "45000");
    formData.set("sintomas", "Ruido al frenar");

    const result = await createOrdenAction("c1", "v1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockSedeFindFirst).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        clienteId: "c1",
        vehiculoId: "v1",
        sedeId: "sede-1",
        creadoPorId: "u1",
        mecanicoId: null,
        kilometrajeIngreso: 45000,
        sintomas: "Ruido al frenar",
      },
    });
  });

  it("propagates the redirect rejection and never touches the database when requireRole rejects (unauthorized)", async () => {
    mockRequireRole.mockReset().mockRejectedValue(new Error("REDIRECT:/login?error=forbidden"));
    const formData = new FormData();

    await expect(createOrdenAction("c1", "v1", initialState, formData)).rejects.toThrow(
      "REDIRECT:/login?error=forbidden",
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("createOrdenDesdeVehiculoAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION);
    mockCreate.mockReset();
    mockVehiculoFindUnique.mockReset();
  });

  it("returns a validation error when no vehiculo is selected, without touching the database", async () => {
    const formData = new FormData();

    const result = await createOrdenDesdeVehiculoAction(initialState, formData);

    expect(result).toEqual({ error: "Selecciona un vehículo", success: false });
    expect(mockVehiculoFindUnique).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns an error when the selected vehiculo does not exist", async () => {
    mockVehiculoFindUnique.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("vehiculoId", "v-missing");

    const result = await createOrdenDesdeVehiculoAction(initialState, formData);

    expect(result).toEqual({ error: "El vehículo seleccionado no existe.", success: false });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("derives clienteId from the vehiculo instead of trusting form data", async () => {
    mockVehiculoFindUnique.mockResolvedValue({ id: "v1", clienteId: "c1" });
    mockCreate.mockResolvedValue({ id: "o1" });
    const formData = new FormData();
    formData.set("vehiculoId", "v1");
    // A forged clienteId in the form must be ignored -- only the vehículo's
    // own clienteId ("c1") may end up in the created row.
    formData.set("clienteId", "c-forjado");
    formData.set("kilometrajeIngreso", "45000");
    formData.set("sintomas", "Ruido al frenar");

    const result = await createOrdenDesdeVehiculoAction(initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockVehiculoFindUnique).toHaveBeenCalledWith({
      where: { id: "v1" },
      select: { id: true, clienteId: true },
    });
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        clienteId: "c1",
        vehiculoId: "v1",
        sedeId: "sede-1",
        creadoPorId: "u1",
        mecanicoId: null,
        kilometrajeIngreso: 45000,
        sintomas: "Ruido al frenar",
      },
    });
  });

  it("propagates the redirect rejection and never touches the database when requireRole rejects (unauthorized)", async () => {
    mockRequireRole.mockReset().mockRejectedValue(new Error("REDIRECT:/login?error=forbidden"));
    const formData = new FormData();
    formData.set("vehiculoId", "v1");

    await expect(createOrdenDesdeVehiculoAction(initialState, formData)).rejects.toThrow(
      "REDIRECT:/login?error=forbidden",
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("listOrdenes", () => {
  beforeEach(() => {
    mockRequireSession.mockReset().mockResolvedValue(SESSION);
    mockFindMany.mockReset();
  });

  const ORDEN_DETAIL_INCLUDE = {
    cliente: true,
    vehiculo: true,
    sede: true,
    mecanico: { select: { id: true, nombre: true } },
    items: true,
    manoDeObra: true,
    dvi: { include: { fotos: true } },
    // total is required by the ordenes list page to show a "Total" column for
    // ya-facturada orders without recomputing it from items/manoDeObra (which
    // would drift once descuento/iva are applied at facturación time).
    factura: { select: { id: true, numero: true, total: true } },
  };

  it("lists only órdenes of the sede activa", async () => {
    mockFindMany.mockResolvedValue([]);

    await listOrdenes();

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { sedeId: "sede-1" },
      include: ORDEN_DETAIL_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  });

  it("combines the estado filter with the sede filter instead of replacing it", async () => {
    mockFindMany.mockResolvedValue([]);

    await listOrdenes("EN_PROCESO");

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { sedeId: "sede-1", estado: "EN_PROCESO" },
      include: ORDEN_DETAIL_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  });
});

describe("listOrdenesByVehiculo", () => {
  beforeEach(() => {
    mockRequireSession.mockReset().mockResolvedValue(SESSION);
    mockFindMany.mockReset();
  });

  const ORDEN_VEHICULO_SELECT = {
    id: true,
    createdAt: true,
    sintomas: true,
    estado: true,
    kilometrajeIngreso: true,
    items: { select: { cantidad: true, precioUnitario: true } },
    manoDeObra: { select: { horas: true, precioHora: true } },
    factura: { select: { total: true } },
  };

  it("scopes a vehículo's órdenes to the sede activa (the vehículo itself is tenant-wide), selecting enough for the vehículo detail page's Total and kilometraje-actual columns", async () => {
    mockFindMany.mockResolvedValue([]);

    await listOrdenesByVehiculo("v1");

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { vehiculoId: "v1", sedeId: "sede-1" },
      select: ORDEN_VEHICULO_SELECT,
      orderBy: { createdAt: "desc" },
    });
  });
});

describe("getOrden", () => {
  beforeEach(() => {
    mockRequireSession.mockReset().mockResolvedValue(SESSION);
    mockOrdenFindFirst.mockReset();
  });

  it("uses findFirst with the sede filter for getOrden, so another sede's id resolves to null", async () => {
    mockOrdenFindFirst.mockResolvedValue(null);

    const result = await getOrden("orden-de-otra-sede");

    expect(result).toBeNull();
    expect(mockOrdenFindFirst).toHaveBeenCalledWith({
      where: { id: "orden-de-otra-sede", sedeId: "sede-1" },
      include: expect.anything(),
    });
  });
});

describe("listTecnicos", () => {
  beforeEach(() => {
    mockRequireSession.mockReset().mockResolvedValue(SESSION);
    mockUsuarioFindMany.mockReset();
  });

  it("lists only técnicos assigned to the sede activa", async () => {
    mockUsuarioFindMany.mockResolvedValue([]);

    await listTecnicos();

    expect(mockUsuarioFindMany).toHaveBeenCalledWith({
      where: { role: "TECNICO", sedes: { some: { sedeId: "sede-1" } } },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
  });
});

describe("updateEstadoOrdenAction", () => {
  const initialEstadoState: EstadoFormState = { error: null };
  const CLAVE_VALIDA = "0".repeat(63) + "1";
  const claveOriginal = process.env.SMTP_ENCRYPTION_KEY;

  // A function, not a constant: SMTP_ENCRYPTION_KEY is only set inside
  // beforeEach, which runs after this describe body is evaluated. Encrypting
  // eagerly here would use whatever key happens to be ambient at collection
  // time (e.g. a real key from .env) instead of CLAVE_VALIDA, and decryption
  // during the test would then fail with a GCM auth-tag mismatch.
  const configSmtpActiva = () => ({
    id: "singleton",
    host: "smtp.taller.test",
    puerto: 587,
    usuario: "avisos@taller.test",
    passwordCifrado: cifrarSecreto("secreto"),
    fromEmail: "avisos@taller.test",
    fromNombre: "Taller Pérez",
    activo: true,
  });

  const ORDEN_BASE = {
    id: "o1",
    estado: "BORRADOR" as const,
    clienteId: "c1",
    cliente: { id: "c1", nombre: "Ana Pérez", email: "ana@cliente.test" },
    vehiculo: { placa: "ABC123", marca: "Mazda", modelo: "3" },
  };

  beforeEach(() => {
    process.env.SMTP_ENCRYPTION_KEY = CLAVE_VALIDA;
    mockRequireRole.mockReset().mockResolvedValue(SESSION);
    mockOrdenFindFirst.mockReset();
    mockUpdate.mockReset();
    mockConfiguracionSmtpFindUnique.mockReset().mockResolvedValue(null);
    mockNotificacionCreate.mockReset().mockResolvedValue({});
    mockEnviarEmail.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (claveOriginal === undefined) {
      delete process.env.SMTP_ENCRYPTION_KEY;
    } else {
      process.env.SMTP_ENCRYPTION_KEY = claveOriginal;
    }
  });

  it("rejects an invalid estado value", async () => {
    const formData = new FormData();
    formData.set("estado", "NOT_A_REAL_ESTADO");

    const result = await updateEstadoOrdenAction("o1", initialEstadoState, formData);

    expect(result.error).toBe("Estado inválido");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects a transition that skips states (BORRADOR straight to TERMINADA)", async () => {
    mockOrdenFindFirst.mockResolvedValue({ ...ORDEN_BASE, estado: "BORRADOR" });
    const formData = new FormData();
    formData.set("estado", "TERMINADA");

    const result = await updateEstadoOrdenAction("o1", initialEstadoState, formData);

    expect(result.error).toBe("No se puede cambiar de BORRADOR a TERMINADA");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("applies a valid transition and stamps entregadaAt when moving to ENTREGADA, without attempting a notification", async () => {
    mockOrdenFindFirst.mockResolvedValue({ ...ORDEN_BASE, estado: "TERMINADA" });
    mockUpdate.mockResolvedValue({ id: "o1", estado: "ENTREGADA" });
    const formData = new FormData();
    formData.set("estado", "ENTREGADA");

    const result = await updateEstadoOrdenAction("o1", initialEstadoState, formData);

    expect(result).toEqual({ error: null, advertencia: null });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { estado: "ENTREGADA", entregadaAt: expect.any(Date), anuladaAt: undefined },
    });
    expect(mockConfiguracionSmtpFindUnique).not.toHaveBeenCalled();
    expect(mockEnviarEmail).not.toHaveBeenCalled();
  });

  it("returns 'Orden no encontrada' when the order does not exist", async () => {
    mockOrdenFindFirst.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("estado", "EN_PROCESO");

    const result = await updateEstadoOrdenAction("missing", initialEstadoState, formData);

    expect(result.error).toBe("Orden no encontrada");
  });

  it("refuses to change the estado of an orden from another sede", async () => {
    mockOrdenFindFirst.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("estado", "EN_PROCESO");

    const result = await updateEstadoOrdenAction("orden-de-otra-sede", initialEstadoState, formData);

    expect(result).toEqual({ error: "Orden no encontrada" });
    expect(mockOrdenFindFirst).toHaveBeenCalledWith({
      where: { id: "orden-de-otra-sede", sedeId: "sede-1" },
      include: { cliente: true, vehiculo: true },
    });
  });

  it("sends a notification email and returns no advertencia when SMTP is configured and active", async () => {
    mockOrdenFindFirst.mockResolvedValue({ ...ORDEN_BASE, estado: "BORRADOR" });
    mockUpdate.mockResolvedValue({ id: "o1", estado: "EN_PROCESO" });
    mockConfiguracionSmtpFindUnique.mockResolvedValue(configSmtpActiva());
    const formData = new FormData();
    formData.set("estado", "EN_PROCESO");

    const result = await updateEstadoOrdenAction("o1", initialEstadoState, formData);

    expect(result).toEqual({ error: null, advertencia: null });
    expect(mockEnviarEmail).toHaveBeenCalledWith(
      expect.objectContaining({ host: "smtp.taller.test" }),
      expect.objectContaining({ para: "ana@cliente.test" }),
    );
    expect(mockNotificacionCreate).toHaveBeenCalledWith({
      data: {
        ordenId: "o1",
        clienteId: "c1",
        estado: "EN_PROCESO",
        emailDestino: "ana@cliente.test",
        resultado: "ENVIADA",
      },
    });
  });

  it("returns an advertencia and does not fail the estado change when SMTP is not configured", async () => {
    mockOrdenFindFirst.mockResolvedValue({ ...ORDEN_BASE, estado: "BORRADOR" });
    mockUpdate.mockResolvedValue({ id: "o1", estado: "EN_PROCESO" });
    mockConfiguracionSmtpFindUnique.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("estado", "EN_PROCESO");

    const result = await updateEstadoOrdenAction("o1", initialEstadoState, formData);

    expect(result.error).toBeNull();
    expect(result.advertencia).toBe(
      "Estado actualizado. El correo del taller no está configurado, no se notificó al cliente.",
    );
    expect(mockEnviarEmail).not.toHaveBeenCalled();
    expect(mockNotificacionCreate).not.toHaveBeenCalled();
  });

  it("returns an advertencia and does not fail the estado change when the client has no email", async () => {
    mockOrdenFindFirst.mockResolvedValue({
      ...ORDEN_BASE,
      estado: "BORRADOR",
      cliente: { id: "c1", nombre: "Ana Pérez", email: null },
    });
    mockUpdate.mockResolvedValue({ id: "o1", estado: "EN_PROCESO" });
    mockConfiguracionSmtpFindUnique.mockResolvedValue(configSmtpActiva());
    const formData = new FormData();
    formData.set("estado", "EN_PROCESO");

    const result = await updateEstadoOrdenAction("o1", initialEstadoState, formData);

    expect(result.advertencia).toBe(
      "Estado actualizado. El cliente no tiene un correo registrado, no se le notificó.",
    );
    expect(mockEnviarEmail).not.toHaveBeenCalled();
  });

  it("returns an advertencia, still succeeds, and records FALLO_ENVIO when the send throws", async () => {
    mockOrdenFindFirst.mockResolvedValue({ ...ORDEN_BASE, estado: "BORRADOR" });
    mockUpdate.mockResolvedValue({ id: "o1", estado: "EN_PROCESO" });
    mockConfiguracionSmtpFindUnique.mockResolvedValue(configSmtpActiva());
    mockEnviarEmail.mockRejectedValue(new Error("ECONNREFUSED"));
    const formData = new FormData();
    formData.set("estado", "EN_PROCESO");

    const result = await updateEstadoOrdenAction("o1", initialEstadoState, formData);

    expect(result.error).toBeNull();
    expect(result.advertencia).toBe(
      "Estado actualizado, pero no se pudo enviar la notificación por correo al cliente.",
    );
    expect(mockNotificacionCreate).toHaveBeenCalledWith({
      data: {
        ordenId: "o1",
        clienteId: "c1",
        estado: "EN_PROCESO",
        emailDestino: "ana@cliente.test",
        resultado: "FALLO_ENVIO",
      },
    });
  });

  it("does not fail the action when the audit write itself throws", async () => {
    mockOrdenFindFirst.mockResolvedValue({ ...ORDEN_BASE, estado: "BORRADOR" });
    mockUpdate.mockResolvedValue({ id: "o1", estado: "EN_PROCESO" });
    mockConfiguracionSmtpFindUnique.mockResolvedValue(configSmtpActiva());
    mockNotificacionCreate.mockRejectedValue(new Error("FK violation"));
    const formData = new FormData();
    formData.set("estado", "EN_PROCESO");

    const result = await updateEstadoOrdenAction("o1", initialEstadoState, formData);

    expect(result).toEqual({ error: null, advertencia: null });
  });

  it("does not fail the estado change when decrypting the SMTP config throws (rotated/corrupted key)", async () => {
    mockOrdenFindFirst.mockResolvedValue({ ...ORDEN_BASE, estado: "BORRADOR" });
    mockUpdate.mockResolvedValue({ id: "o1", estado: "EN_PROCESO" });
    mockConfiguracionSmtpFindUnique.mockResolvedValue({ ...configSmtpActiva(), passwordCifrado: "basura" });
    const formData = new FormData();
    formData.set("estado", "EN_PROCESO");

    const result = await updateEstadoOrdenAction("o1", initialEstadoState, formData);

    expect(result.error).toBeNull();
    expect(result.advertencia).toBe(
      "Estado actualizado, pero no se pudo enviar la notificación por correo al cliente.",
    );
    expect(mockEnviarEmail).not.toHaveBeenCalled();
    expect(mockNotificacionCreate).not.toHaveBeenCalled();
  });
});
