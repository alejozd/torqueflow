import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequirePermiso = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requirePermiso: (...args: unknown[]) => mockRequirePermiso(...args),
  requireSession: vi.fn(),
}));

const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();
const mockUpdate = vi.fn();
const mockAggregate = vi.fn();
const mockCount = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    configuracionFacturaElectronica: { findUnique: mockFindUnique, upsert: mockUpsert, update: mockUpdate },
    documentoElectronico: { aggregate: mockAggregate, count: mockCount },
  }),
}));

const mockProbar = vi.fn();
const mockCrearProveedor = vi.fn(() => ({ probarConexion: mockProbar }));
vi.mock("@/lib/factura-electronica/configuracion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/factura-electronica/configuracion")>()),
  crearProveedorDesdeConfig: (...args: unknown[]) => mockCrearProveedor(...(args as [])),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { calcularDvNit } from "@/modulos/factura-electronica";
import {
  getConfiguracionFe,
  guardarConfiguracionFeAction,
  probarConexionFeAction,
  type ConfigFeFormState,
} from "./factura-electronica-config-actions";

const SESION = { user: { id: "u1", tenantSchema: "taller_x", sedeActivaId: "s1", permisos: [] } };
const inicial: ConfigFeFormState = { error: null, success: false, mensaje: null };
const NIT = "900123456";

function form(campos: Record<string, string> = {}): FormData {
  const valores: Record<string, string> = {
    activa: "on",
    envio: "AUTOMATICO",
    ambiente: "SIMULADO",
    cuenta: "PROPIA",
    token: "",
    nit: NIT,
    dv: calcularDvNit(NIT),
    razonSocial: "Taller Pérez",
    regimen: "48",
    responsabilidadFiscal: "O-13",
    municipioCodigo: "05001",
    direccion: "Calle 1",
    resolucionNumero: "18760000001",
    prefijo: "SETP",
    rangoDesde: "1",
    rangoHasta: "5000",
    vigenciaDesde: "2026-01-01",
    vigenciaHasta: "2027-12-31",
    prefijoNotaCredito: "NC",
    resultadoSimulado: "ACEPTAR",
    confirmarProduccion: "",
    ...campos,
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries(valores)) fd.set(k, v);
  return fd;
}

function fila(extra: Record<string, unknown> = {}) {
  return {
    id: "singleton",
    activa: false,
    envio: "AUTOMATICO",
    ambiente: "SIMULADO",
    cuenta: "PROPIA",
    tokenCifrado: null,
    nit: NIT,
    dv: calcularDvNit(NIT),
    razonSocial: "Taller Pérez",
    regimen: "48",
    responsabilidadFiscal: "O-13",
    municipioCodigo: "05001",
    direccion: "Calle 1",
    resolucionNumero: "18760000001",
    prefijo: "SETP",
    rangoDesde: 1,
    rangoHasta: 5000,
    vigenciaDesde: new Date("2026-01-01T00:00:00.000Z"),
    vigenciaHasta: new Date("2027-12-31T00:00:00.000Z"),
    siguienteConsecutivo: 40,
    prefijoNotaCredito: "NC",
    siguienteConsecutivoNotaCredito: 1,
    resultadoSimulado: "ACEPTAR",
    ultimaPruebaAt: null,
    ultimaPruebaExitosa: null,
    ultimaPruebaMensaje: null,
    ambienteProveedor: null,
    activadaDesde: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePermiso.mockResolvedValue(SESION);
  mockAggregate.mockResolvedValue({ _max: { numero: null } });
  mockCount.mockResolvedValue(0);
  process.env.SMTP_ENCRYPTION_KEY = "0".repeat(63) + "1";
});

describe("getConfiguracionFe", () => {
  it("pide el permiso de configurar y, sin fila, devuelve los valores por defecto", async () => {
    mockFindUnique.mockResolvedValue(null);
    const vista = await getConfiguracionFe();
    expect(mockRequirePermiso).toHaveBeenCalledWith("facturaElectronica.configurar");
    expect(vista).toMatchObject({ activa: false, ambiente: "SIMULADO", cuenta: "BOLSA", tokenConfigurado: false, siguienteConsecutivo: 1 });
  });

  it("nunca devuelve el token y lee las fechas como día", async () => {
    mockFindUnique.mockResolvedValue(fila({ tokenCifrado: "v1:x:y:z" }));
    const vista = await getConfiguracionFe();
    expect(vista).not.toHaveProperty("tokenCifrado");
    expect(vista).toMatchObject({ tokenConfigurado: true, vigenciaDesde: "2026-01-01", vigenciaHasta: "2027-12-31" });
  });
});

describe("guardarConfiguracionFeAction", () => {
  it("guarda, cifra el token nuevo y marca la fecha de activación la primera vez", async () => {
    mockFindUnique.mockResolvedValue(fila());
    const r = await guardarConfiguracionFeAction(inicial, form({ token: "tok-123" }));
    expect(r).toEqual({ error: null, success: true, mensaje: "Configuración guardada." });
    const { update } = mockUpsert.mock.calls[0][0];
    expect(update.tokenCifrado).toMatch(/^v1:/);
    expect(update.activadaDesde).toBeInstanceOf(Date);
    expect(update.vigenciaDesde).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    // La resolución no cambió: el consecutivo se conserva.
    expect(update).not.toHaveProperty("siguienteConsecutivo");
  });

  it("con el token en blanco conserva el guardado y no vuelve a fechar la activación", async () => {
    const activada = new Date("2026-05-01T00:00:00.000Z");
    mockFindUnique.mockResolvedValue(fila({ tokenCifrado: "v1:viejo", activa: true, activadaDesde: activada }));
    await guardarConfiguracionFeAction(inicial, form());
    const { update } = mockUpsert.mock.calls[0][0];
    expect(update.tokenCifrado).toBe("v1:viejo");
    expect(update).not.toHaveProperty("activadaDesde");
  });

  it("una resolución nueva reinicia el consecutivo al inicio del rango", async () => {
    mockFindUnique.mockResolvedValue(fila());
    await guardarConfiguracionFeAction(inicial, form({ resolucionNumero: "18760000999", rangoDesde: "100", rangoHasta: "900" }));
    expect(mockUpsert.mock.calls[0][0].update.siguienteConsecutivo).toBe(100);
  });

  it("una resolución nueva con el mismo prefijo sigue después del último número usado en ese ambiente", async () => {
    mockFindUnique.mockResolvedValue(fila());
    mockAggregate.mockResolvedValue({ _max: { numero: 57 } });
    await guardarConfiguracionFeAction(inicial, form({ resolucionNumero: "18760000999" }));
    expect(mockAggregate).toHaveBeenCalledWith({
      _max: { numero: true },
      where: { tipo: "FACTURA", ambiente: "SIMULADO", prefijo: "SETP" },
    });
    expect(mockUpsert.mock.calls[0][0].update.siguienteConsecutivo).toBe(58);
  });

  it("una resolución con prefijo nuevo y sin documentos arranca en el inicio del rango", async () => {
    mockFindUnique.mockResolvedValue(fila());
    mockAggregate.mockResolvedValue({ _max: { numero: null } });
    await guardarConfiguracionFeAction(inicial, form({ prefijo: "FE", rangoDesde: "300" }));
    expect(mockAggregate).toHaveBeenCalledWith({
      _max: { numero: true },
      where: { tipo: "FACTURA", ambiente: "SIMULADO", prefijo: "FE" },
    });
    expect(mockUpsert.mock.calls[0][0].update.siguienteConsecutivo).toBe(300);
  });

  it("pasar a producción pide confirmación", async () => {
    mockFindUnique.mockResolvedValue(fila({ ambiente: "PRUEBAS", tokenCifrado: "v1:t" }));
    const sin = await guardarConfiguracionFeAction(inicial, form({ ambiente: "PRODUCCION" }));
    expect(sin).toEqual({
      error: "Confirma el paso a producción: desde ahí las facturas tienen validez ante la DIAN.",
      success: false,
      mensaje: null,
    });
    expect(mockUpsert).not.toHaveBeenCalled();
    const con = await guardarConfiguracionFeAction(inicial, form({ ambiente: "PRODUCCION", confirmarProduccion: "si" }));
    expect(con.success).toBe(true);
  });

  it("al pasar a producción por primera vez reinicia la activación y ambos consecutivos", async () => {
    const antes = new Date("2026-11-01T00:00:00.000Z");
    mockFindUnique.mockResolvedValue(fila({ ambiente: "PRUEBAS", tokenCifrado: "v1:t", activa: true, activadaDesde: antes, siguienteConsecutivo: 80 }));
    mockCount.mockResolvedValue(0);
    mockAggregate.mockResolvedValue({ _max: { numero: null } });
    const r = await guardarConfiguracionFeAction(inicial, form({ ambiente: "PRODUCCION", confirmarProduccion: "si" }));
    expect(r.success).toBe(true);
    const { update } = mockUpsert.mock.calls[0][0];
    expect(update.siguienteConsecutivo).toBe(1);
    expect(update.siguienteConsecutivoNotaCredito).toBe(1);
    expect(update.activadaDesde).toBeInstanceOf(Date);
    expect(update.activadaDesde.getTime()).toBeGreaterThan(antes.getTime());
  });

  it("si ya hubo documentos en producción no vuelve a fechar la activación", async () => {
    mockFindUnique.mockResolvedValue(fila({ ambiente: "PRUEBAS", tokenCifrado: "v1:t", activa: true, activadaDesde: new Date() }));
    mockCount.mockResolvedValue(3);
    mockAggregate.mockResolvedValue({ _max: { numero: 41 } });
    await guardarConfiguracionFeAction(inicial, form({ ambiente: "PRODUCCION", confirmarProduccion: "si" }));
    const { update } = mockUpsert.mock.calls[0][0];
    expect(update).not.toHaveProperty("activadaDesde");
    expect(update.siguienteConsecutivo).toBe(42);
  });

  it("pasó a producción inactiva y se activa después: vuelve a fechar la activación si no hay documentos en producción", async () => {
    const antes = new Date("2026-11-01T00:00:00.000Z");
    mockFindUnique.mockResolvedValue(fila({ ambiente: "PRODUCCION", tokenCifrado: "v1:t", activa: false, activadaDesde: antes }));
    mockCount.mockResolvedValue(0);
    const r = await guardarConfiguracionFeAction(inicial, form({ ambiente: "PRODUCCION" }));
    expect(r.success).toBe(true);
    const { update } = mockUpsert.mock.calls[0][0];
    expect(update.activadaDesde).toBeInstanceOf(Date);
    expect(update.activadaDesde.getTime()).toBeGreaterThan(antes.getTime());
    expect(mockCount).toHaveBeenCalledWith({ where: { ambiente: "PRODUCCION" } });
  });

  it("activar en producción con documentos de producción no vuelve a fechar la activación", async () => {
    mockFindUnique.mockResolvedValue(fila({ ambiente: "PRODUCCION", tokenCifrado: "v1:t", activa: false, activadaDesde: new Date() }));
    mockCount.mockResolvedValue(2);
    await guardarConfiguracionFeAction(inicial, form({ ambiente: "PRODUCCION" }));
    const { update } = mockUpsert.mock.calls[0][0];
    expect(update).not.toHaveProperty("activadaDesde");
  });

  it("guardar sin cambiar de ambiente no toca los consecutivos", async () => {
    mockFindUnique.mockResolvedValue(fila({ ambiente: "PRODUCCION", tokenCifrado: "v1:t", activa: true, activadaDesde: new Date() }));
    await guardarConfiguracionFeAction(inicial, form({ ambiente: "PRODUCCION" }));
    const { update } = mockUpsert.mock.calls[0][0];
    expect(update).not.toHaveProperty("siguienteConsecutivo");
    expect(update).not.toHaveProperty("siguienteConsecutivoNotaCredito");
  });

  it("activa fuera de Simulado exige emisor, resolución y token propio", async () => {
    mockFindUnique.mockResolvedValue(fila());
    const r = await guardarConfiguracionFeAction(inicial, form({ ambiente: "PRUEBAS", razonSocial: "" }));
    expect(r.error).toBe("Para activar fuera de Simulado faltan: razón social, token del proveedor.");
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("con la bolsa de TorqueFlow no deja activar fuera de Simulado si TorqueFlow aún no registró el token", async () => {
    mockFindUnique.mockResolvedValue(fila({ cuenta: "BOLSA" }));
    const r = await guardarConfiguracionFeAction(inicial, form({ ambiente: "PRUEBAS", cuenta: "BOLSA", token: "intento" }));
    expect(r.error).toBe("Para activar fuera de Simulado faltan: token del proveedor (con la bolsa de TorqueFlow lo registra TorqueFlow).");
  });

  it("devuelve el primer error de validación", async () => {
    mockFindUnique.mockResolvedValue(fila());
    const r = await guardarConfiguracionFeAction(inicial, form({ dv: "", nit: "12" }));
    expect(r).toEqual({ error: "El NIT va sin puntos, guiones ni DV.", success: false, mensaje: null });
  });
});

describe("probarConexionFeAction", () => {
  it("guarda el resultado y el ambiente que informa el proveedor", async () => {
    mockFindUnique.mockResolvedValue(fila({ ambiente: "PRUEBAS", tokenCifrado: "v1:t" }));
    mockProbar.mockResolvedValue({ ok: true, ambiente: "PRUEBAS" });
    const r = await probarConexionFeAction(inicial, new FormData());
    expect(r).toEqual({ error: null, success: true, mensaje: "Conexión correcta. El proveedor está en pruebas." });
    expect(mockUpdate.mock.calls[0][0].data).toMatchObject({ ultimaPruebaExitosa: true, ambienteProveedor: "PRUEBAS" });
  });

  it("avisa si el proveedor está en otro ambiente", async () => {
    mockFindUnique.mockResolvedValue(fila({ ambiente: "PRODUCCION", tokenCifrado: "v1:t" }));
    mockProbar.mockResolvedValue({ ok: true, ambiente: "PRUEBAS" });
    const r = await probarConexionFeAction(inicial, new FormData());
    expect(r.error).toBe(
      "Hay conexión, pero el proveedor está en pruebas y el taller en producción. No se enviará nada hasta que coincidan.",
    );
    expect(mockUpdate.mock.calls[0][0].data.ultimaPruebaExitosa).toBe(false);
  });

  it("un error de configuración se guarda como prueba fallida", async () => {
    const { ErrorConfiguracionFe } = await import("@/lib/factura-electronica/configuracion");
    mockFindUnique.mockResolvedValue(fila({ ambiente: "PRUEBAS" }));
    mockCrearProveedor.mockImplementationOnce(() => {
      throw new ErrorConfiguracionFe("Falta el token.");
    });
    const r = await probarConexionFeAction(inicial, new FormData());
    expect(r).toEqual({ error: "Falta el token.", success: false, mensaje: null });
    expect(mockUpdate.mock.calls[0][0].data).toMatchObject({ ultimaPruebaExitosa: false, ultimaPruebaMensaje: "Falta el token." });
  });

  it("sin configuración guardada no prueba nada", async () => {
    mockFindUnique.mockResolvedValue(null);
    const r = await probarConexionFeAction(inicial, new FormData());
    expect(r.error).toBe("Guarda la configuración antes de probar la conexión.");
    expect(mockCrearProveedor).not.toHaveBeenCalled();
  });
});
