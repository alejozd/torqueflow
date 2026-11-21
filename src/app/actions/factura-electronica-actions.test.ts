import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequirePermiso = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requirePermiso: (...a: unknown[]) => mockRequirePermiso(...a),
  requireSession: (...a: unknown[]) => mockRequireSession(...a),
  puede: (s: { user: { permisos: string[] } }, p: string) => s.user.permisos.includes(p),
}));

const mockConfig = vi.fn();
const mockFacturaFindFirst = vi.fn();
const mockFacturaCount = vi.fn();
const mockDocFindFirst = vi.fn();
const DB = {
  configuracionFacturaElectronica: { findUnique: mockConfig },
  factura: { findFirst: mockFacturaFindFirst, count: mockFacturaCount },
  documentoElectronico: { findFirst: mockDocFindFirst },
};
vi.mock("@/lib/db/tenant-client", () => ({ getTenantDb: () => DB }));

const mockEmitir = vi.fn();
const mockReintentar = vi.fn();
const mockNotaCredito = vi.fn();
vi.mock("@/lib/factura-electronica/servicio", () => ({
  emitirDocumentoFactura: (...a: unknown[]) => mockEmitir(...a),
  reintentarDocumento: (...a: unknown[]) => mockReintentar(...a),
  emitirNotaCredito: (...a: unknown[]) => mockNotaCredito(...a),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  contarFacturasSinEnviarDian,
  enviarFacturaDianAction,
  getFacturaFe,
  anularConNotaCreditoAction,
  reenviarDocumentoAction,
  type EnvioFeState,
} from "./factura-electronica-actions";

const SESION = { user: { id: "u1", tenantSchema: "taller_x", sedeActivaId: "s1", permisos: ["facturas.ver", "facturas.facturar"] } };
const inicial: EnvioFeState = { error: null, success: false, mensaje: null, errores: [] };
const ACTIVADA = new Date("2026-11-01T00:00:00Z");
const config = { activa: true, envio: "MANUAL", ambiente: "SIMULADO", activadaDesde: ACTIVADA };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePermiso.mockResolvedValue(SESION);
  mockRequireSession.mockResolvedValue(SESION);
  mockConfig.mockResolvedValue(config);
});

describe("getFacturaFe", () => {
  it("null si la facturación electrónica no está activa", async () => {
    mockConfig.mockResolvedValue({ ...config, activa: false });
    expect(await getFacturaFe("f1")).toBeNull();
  });

  it("busca la factura en la sede activa y arma la vista con su documento", async () => {
    mockFacturaFindFirst.mockResolvedValue({
      createdAt: new Date("2026-11-10T00:00:00Z"),
      documentosElectronicos: [
        {
          id: "d1",
          tipo: "FACTURA",
          estado: "ACEPTADO",
          prefijo: "SETP",
          numero: 7,
          cufe: "abc",
          fechaValidacion: null,
          mensajes: [],
          xmlRuta: "/api/uploads/x.xml",
          pdfRuta: null,
          ambiente: "SIMULADO",
          intentos: 1,
          ultimoIntentoAt: null,
        },
      ],
    });
    const vista = await getFacturaFe("f1");
    expect(mockRequirePermiso).toHaveBeenCalledWith("facturas.ver");
    expect(mockFacturaFindFirst.mock.calls[0][0].where).toEqual({ id: "f1", orden: { sedeId: "s1" } });
    expect(vista).toMatchObject({ activa: true, envio: "MANUAL", cuenta: true, documento: { id: "d1", estado: "ACEPTADO", numero: 7 } });
  });

  it("si los mensajes guardados no son una lista, la vista trae una lista vacía", async () => {
    mockFacturaFindFirst.mockResolvedValue({
      createdAt: new Date("2026-11-10T00:00:00Z"),
      documentosElectronicos: [
        {
          id: "d1",
          tipo: "FACTURA",
          estado: "RECHAZADO",
          prefijo: "SETP",
          numero: 7,
          cufe: null,
          fechaValidacion: null,
          mensajes: { raro: true },
          xmlRuta: null,
          pdfRuta: null,
          ambiente: "SIMULADO",
          intentos: 1,
          ultimoIntentoAt: null,
        },
      ],
    });
    const vista = await getFacturaFe("f1");
    expect(vista?.documento?.mensajes).toEqual([]);
  });
});

describe("enviarFacturaDianAction", () => {
  it("pide facturar, verifica la sede y traduce un envío aceptado", async () => {
    mockFacturaFindFirst.mockResolvedValue({ id: "f1" });
    mockEmitir.mockResolvedValue({ ok: true, documentoId: "d1", estado: "ACEPTADO", mensajes: [] });
    const r = await enviarFacturaDianAction("f1", inicial, new FormData());
    expect(mockRequirePermiso).toHaveBeenCalledWith("facturas.facturar");
    expect(mockEmitir.mock.calls[0][0]).toMatchObject({ tenantSchema: "taller_x", usuarioId: "u1" });
    expect(mockEmitir.mock.calls[0][1]).toBe("f1");
    expect(r).toEqual({ error: null, success: true, mensaje: "La DIAN aceptó la factura.", errores: [] });
  });

  it("una validación fallida devuelve los faltantes", async () => {
    mockFacturaFindFirst.mockResolvedValue({ id: "f1" });
    const errores = [{ campo: "cliente.tipoDocumento", mensaje: "Falta el tipo de documento del cliente." }];
    mockEmitir.mockResolvedValue({ ok: false, motivo: "VALIDACION", mensaje: "Faltan datos para la factura electrónica.", errores });
    const r = await enviarFacturaDianAction("f1", inicial, new FormData());
    expect(r).toEqual({ error: "Faltan datos para la factura electrónica.", success: false, mensaje: null, errores });
  });

  it("una factura de otra sede no se envía", async () => {
    mockFacturaFindFirst.mockResolvedValue(null);
    const r = await enviarFacturaDianAction("f9", inicial, new FormData());
    expect(r.error).toBe("La factura no existe.");
    expect(mockEmitir).not.toHaveBeenCalled();
  });
});

describe("reenviarDocumentoAction", () => {
  it("solo reenvía un documento de esa factura", async () => {
    mockFacturaFindFirst.mockResolvedValue({ id: "f1" });
    mockDocFindFirst.mockResolvedValue(null);
    const r = await reenviarDocumentoAction("f1", "d-de-otra", inicial, new FormData());
    expect(mockDocFindFirst.mock.calls[0][0].where).toEqual({ id: "d-de-otra", facturaId: "f1" });
    expect(r.error).toBe("El documento no existe.");
    expect(mockReintentar).not.toHaveBeenCalled();
  });

  it("un rechazo se informa con sus motivos", async () => {
    mockFacturaFindFirst.mockResolvedValue({ id: "f1" });
    mockDocFindFirst.mockResolvedValue({ id: "d1" });
    mockReintentar.mockResolvedValue({ ok: true, documentoId: "d1", estado: "RECHAZADO", mensajes: [] });
    const r = await reenviarDocumentoAction("f1", "d1", inicial, new FormData());
    expect(r).toEqual({ error: "La DIAN rechazó la factura. Revisa los motivos, corrige y vuelve a enviarla.", success: false, mensaje: null, errores: [] });
  });
});

describe("contarFacturasSinEnviarDian", () => {
  it("0 sin permiso de ver facturas o con la facturación inactiva", async () => {
    mockRequireSession.mockResolvedValue({ user: { ...SESION.user, permisos: [] } });
    expect(await contarFacturasSinEnviarDian()).toBe(0);
    mockRequireSession.mockResolvedValue(SESION);
    mockConfig.mockResolvedValue({ ...config, activa: false });
    expect(await contarFacturasSinEnviarDian()).toBe(0);
    expect(mockFacturaCount).not.toHaveBeenCalled();
  });

  it("cuenta en la sede activa desde la activación las que no tienen documento o lo tienen pendiente", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-21T12:00:00.000Z"));
    try {
      mockFacturaCount.mockResolvedValue(3);
      expect(await contarFacturasSinEnviarDian()).toBe(3);
      expect(mockFacturaCount.mock.calls[0][0].where).toEqual({
        orden: { sedeId: "s1" },
        createdAt: { gte: ACTIVADA },
        OR: [
          { documentosElectronicos: { none: { tipo: "FACTURA" } } },
          { documentosElectronicos: { some: { tipo: "FACTURA", estado: { in: ["PENDIENTE", "POR_CONFIRMAR", "RECHAZADO"] } } } },
          // Un envío interrumpido (ENVIANDO hace más de 2 minutos o sin fecha) también está pendiente.
          {
            documentosElectronicos: {
              some: {
                tipo: "FACTURA",
                estado: "ENVIANDO",
                OR: [{ ultimoIntentoAt: null }, { ultimoIntentoAt: { lt: new Date("2026-11-21T11:58:00.000Z") } }],
              },
            },
          },
        ],
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("getFacturaFe con nota crédito", () => {
  it("la vista trae la nota crédito aparte de la factura", async () => {
    const base = { estado: "ACEPTADO", prefijo: "SETP", cufe: null, fechaValidacion: null, mensajes: [], xmlRuta: null, pdfRuta: null, ambiente: "SIMULADO", intentos: 1, ultimoIntentoAt: null };
    mockFacturaFindFirst.mockResolvedValue({
      createdAt: new Date("2026-11-10T00:00:00Z"),
      documentosElectronicos: [
        { ...base, id: "d1", tipo: "FACTURA", numero: 7 },
        { ...base, id: "n1", tipo: "NOTA_CREDITO", prefijo: "NC", numero: 3 },
      ],
    });
    const vista = await getFacturaFe("f1");
    expect(vista?.documento).toMatchObject({ id: "d1", numero: 7 });
    expect(vista?.notaCredito).toMatchObject({ id: "n1", prefijo: "NC", numero: 3 });
  });

  it("sin nota crédito, notaCredito es null", async () => {
    mockFacturaFindFirst.mockResolvedValue({ createdAt: new Date("2026-11-10T00:00:00Z"), documentosElectronicos: [] });
    expect((await getFacturaFe("f1"))?.notaCredito).toBeNull();
  });
});

describe("anularConNotaCreditoAction", () => {
  const fd = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };

  it("pide el permiso de anular, valida el concepto y traduce la aceptación", async () => {
    mockFacturaFindFirst.mockResolvedValue({ id: "f1" });
    mockNotaCredito.mockResolvedValue({ ok: true, documentoId: "n1", estado: "ACEPTADO", mensajes: [] });
    const r = await anularConNotaCreditoAction("f1", inicial, fd({ concepto: "2", motivo: "Error" }));
    expect(mockRequirePermiso).toHaveBeenCalledWith("facturaElectronica.anular");
    expect(mockNotaCredito.mock.calls[0][2]).toEqual({ concepto: "2", motivo: "Error" });
    expect(r).toEqual({ error: null, success: true, mensaje: "La DIAN aceptó la nota crédito. La factura quedó anulada.", errores: [] });
  });

  it("concepto inválido no llama al servicio", async () => {
    mockFacturaFindFirst.mockResolvedValue({ id: "f1" });
    const r = await anularConNotaCreditoAction("f1", inicial, fd({ concepto: "9", motivo: "x" }));
    expect(r.error).toBe("Elige el concepto de la nota crédito.");
    expect(mockNotaCredito).not.toHaveBeenCalled();
  });
});
