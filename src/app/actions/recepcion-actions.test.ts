import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({ requireRole: (...args: unknown[]) => mockRequireRole(...args) }));

const mockSaveOrdenArchivo = vi.fn();
const mockBorrarUpload = vi.fn();
vi.mock("@/lib/storage/local-file-storage", () => ({
  saveOrdenArchivo: (...args: unknown[]) => mockSaveOrdenArchivo(...args),
  borrarArchivoDeOrden: (...args: unknown[]) => mockBorrarUpload(...args),
  // La acción lo usa para rechazar un data URL enorme antes de decodificarlo.
  MAX_UPLOAD_SIZE_BYTES: 5 * 1024 * 1024,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const tx = {
  ordenTrabajo: { update: vi.fn(), updateMany: vi.fn() },
  actaEntrega: { upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
  garantia: { create: vi.fn(), delete: vi.fn() },
  auditLog: { create: vi.fn() },
};

const db = {
  ordenTrabajo: { findFirst: vi.fn(), update: vi.fn() },
  danioOrden: { create: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
  actaEntrega: { upsert: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
  manoDeObra: { findFirst: vi.fn() },
  itemOrden: { findFirst: vi.fn() },
  garantia: { findFirst: vi.fn(), findMany: vi.fn() },
  vehiculo: { findFirst: vi.fn() },
  configuracionTaller: { findUnique: vi.fn() },
  $transaction: (fn: (cliente: typeof tx) => unknown) => fn(tx),
};
vi.mock("@/lib/db/tenant-client", () => ({ getTenantDb: () => db }));

import {
  agregarDanioAction,
  agregarGarantiaAction,
  borrarActaAction,
  entregarOrdenAction,
  firmarActaAction,
  guardarActaAction,
  guardarRecepcionAction,
  listGarantiasDeVehiculo,
  quitarDanioAction,
  quitarGarantiaAction,
} from "./recepcion-actions";

const ADMIN = { user: { id: "u1", role: "ADMIN", tenantSchema: "taller", sedeActivaId: "sede-1" } };
const inicial = { error: null, success: false };

function fd(campos: Record<string, string | File>): FormData {
  const formData = new FormData();
  for (const [clave, valor] of Object.entries(campos)) formData.set(clave, valor);
  return formData;
}

const firmaPng = () => new File([new Uint8Array([1, 2, 3])], "firma.png", { type: "image/png" });

/** Orden editable de la sede activa, lista para entregar (TERMINADA → ENTREGADA). */
const ORDEN_MUTABLE = {
  id: "o1",
  estado: "TERMINADA",
  factura: null,
  acta: null,
  cliente: { id: "c1", nombre: "Ana", email: "ana@correo.com" },
  vehiculo: { placa: "ABC123", marca: "Renault", modelo: "Logan" },
};

describe("guardarRecepcionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(ADMIN);
    db.ordenTrabajo.findFirst.mockResolvedValue({ id: "o1", estado: "EN_PROCESO", factura: null });
    db.ordenTrabajo.update.mockResolvedValue({});
    mockSaveOrdenArchivo.mockResolvedValue({ relativePath: "taller/ordenes/o1/firma/f.png", url: "/api/uploads/taller/ordenes/o1/firma/f.png" });
    mockBorrarUpload.mockResolvedValue(true);
    tx.actaEntrega.upsert.mockResolvedValue({});
    tx.actaEntrega.update.mockResolvedValue({});
    tx.garantia.create.mockResolvedValue({ id: "g1" });
    tx.garantia.delete.mockResolvedValue({});
    tx.ordenTrabajo.update.mockResolvedValue({});
    tx.auditLog.create.mockResolvedValue({});
  });

  it("guarda kilometraje y nivel de combustible de la sede activa", async () => {
    const r = await guardarRecepcionAction("o1", inicial, fd({ kilometrajeIngreso: "85000", nivelCombustible: "MEDIO" }));

    expect(r).toEqual({ error: null, success: true });
    expect(db.ordenTrabajo.update).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { kilometrajeIngreso: 85000, nivelCombustible: "MEDIO" },
    });
    expect(db.ordenTrabajo.findFirst).toHaveBeenCalledWith({
      where: { id: "o1", sedeId: "sede-1" },
      select: { id: true, estado: true, factura: { select: { id: true } } },
    });
  });

  it("valida antes de tocar la base", async () => {
    const r = await guardarRecepcionAction("o1", inicial, fd({ kilometrajeIngreso: "-5", nivelCombustible: "" }));

    expect(r.error).toBe("El kilometraje no puede ser negativo");
    expect(db.ordenTrabajo.update).not.toHaveBeenCalled();
  });

  it("rechaza una orden de otra sede o ya entregada", async () => {
    db.ordenTrabajo.findFirst.mockResolvedValue(null);
    expect((await guardarRecepcionAction("ajena", inicial, fd({ kilometrajeIngreso: "1", nivelCombustible: "" }))).error).toBe(
      "Orden no encontrada",
    );

    db.ordenTrabajo.findFirst.mockResolvedValue({ id: "o1", estado: "ENTREGADA", factura: null });
    expect((await guardarRecepcionAction("o1", inicial, fd({ kilometrajeIngreso: "1", nivelCombustible: "" }))).error).toContain(
      "no se puede modificar",
    );
  });
});

describe("marcas del diagrama", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(ADMIN);
    db.ordenTrabajo.findFirst.mockResolvedValue({ id: "o1", estado: "EN_PROCESO", factura: null });
    db.danioOrden.create.mockResolvedValue({ id: "d1" });
    db.danioOrden.delete.mockResolvedValue({});
  });

  it("agrega una marca con su nota", async () => {
    const r = await agregarDanioAction("o1", inicial, fd({ zona: "PUERTA_DERECHA", tipo: "GOLPE", nota: "Leve" }));

    expect(r).toEqual({ error: null, success: true });
    expect(db.danioOrden.create).toHaveBeenCalledWith({
      data: { ordenId: "o1", zona: "PUERTA_DERECHA", tipo: "GOLPE", nota: "Leve", creadoPorId: "u1" },
    });
  });

  it("avisa cuando esa zona ya tiene ese mismo daño", async () => {
    db.danioOrden.create.mockRejectedValue({ code: "P2002" });

    const r = await agregarDanioAction("o1", inicial, fd({ zona: "CAPO", tipo: "RAYON", nota: "" }));

    expect(r.error).toBe("Esa zona ya está marcada con ese mismo daño");
  });

  it("quitar una marca pide rol de borrado y respeta la inmutabilidad", async () => {
    db.danioOrden.findFirst.mockResolvedValue({
      id: "d1",
      ordenId: "o1",
      orden: { estado: "EN_PROCESO", factura: null },
    });

    const r = await quitarDanioAction("d1");

    expect(r).toEqual({ error: null, success: true });
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(db.danioOrden.findFirst).toHaveBeenCalledWith({
      where: { id: "d1", orden: { sedeId: "sede-1" } },
      select: { id: true, ordenId: true, orden: { select: { estado: true, factura: { select: { id: true } } } } },
    });
    expect(db.danioOrden.delete).toHaveBeenCalledWith({ where: { id: "d1" } });

    db.danioOrden.findFirst.mockResolvedValue({
      id: "d1",
      ordenId: "o1",
      orden: { estado: "ENTREGADA", factura: null },
    });
    expect((await quitarDanioAction("d1")).error).toContain("no se puede modificar");
  });
});

describe("acta de entrega", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(ADMIN);
    db.ordenTrabajo.findFirst.mockResolvedValue({ id: "o1", estado: "EN_PROCESO", factura: null });
    db.actaEntrega.upsert.mockResolvedValue({ id: "a1" });
    db.actaEntrega.deleteMany.mockResolvedValue({ count: 1 });
    mockSaveOrdenArchivo.mockResolvedValue({ relativePath: "taller/ordenes/o1/firma/f.png", url: "/api/uploads/taller/ordenes/o1/firma/f.png" });
    mockBorrarUpload.mockResolvedValue(true);
    tx.actaEntrega.upsert.mockResolvedValue({ id: "a1" });
    tx.actaEntrega.update.mockResolvedValue({});
    tx.actaEntrega.updateMany.mockResolvedValue({ count: 1 });
    tx.actaEntrega.create.mockResolvedValue({ id: "a-nueva" });
    tx.actaEntrega.findFirst.mockResolvedValue(null);
    tx.ordenTrabajo.update.mockResolvedValue({});
    tx.auditLog.create.mockResolvedValue({});
  });

  it("guarda el borrador del acta sin firma", async () => {
    const r = await guardarActaAction("o1", inicial, fd({ recibidoPor: "María", documentoRecibe: "1.020", observaciones: "Sin novedad" }));

    expect(r).toEqual({ error: null, success: true });
    expect(db.actaEntrega.upsert).toHaveBeenCalledWith({
      where: { ordenId: "o1" },
      create: {
        ordenId: "o1",
        recibidoPor: "María",
        documentoRecibe: "1.020",
        observaciones: "Sin novedad",
        creadoPorId: "u1",
      },
      update: { recibidoPor: "María", documentoRecibe: "1.020", observaciones: "Sin novedad" },
    });
  });

  it("guarda el borrador del acta de una orden terminada y ya facturada", async () => {
    db.ordenTrabajo.findFirst.mockResolvedValue({ id: "o1", estado: "TERMINADA", factura: { id: "f1" } });

    const r = await guardarActaAction("o1", inicial, fd({ recibidoPor: "María" }));

    expect(r).toEqual({ error: null, success: true });
    expect(db.actaEntrega.upsert).toHaveBeenCalled();
  });

  it("no guarda el acta de una orden anulada y lo dice", async () => {
    db.ordenTrabajo.findFirst.mockResolvedValue({ id: "o1", estado: "ANULADA", factura: null });

    const r = await guardarActaAction("o1", inicial, fd({ recibidoPor: "María" }));

    expect(r.error).toBe("La orden está anulada: no se puede modificar");
    expect(db.actaEntrega.upsert).not.toHaveBeenCalled();
  });

  it("firma un acta pendiente de una orden entregada y audita", async () => {
    db.ordenTrabajo.findFirst.mockResolvedValue({
      id: "o1",
      estado: "ENTREGADA",
      acta: { id: "a1", firmadaAt: null, firmaUrl: null, firmaFotoUrl: null },
    });

    const r = await firmarActaAction("o1", inicial, fd({ recibidoPor: "María", documentoRecibe: "", observaciones: "", firma: firmaPng() }));

    expect(r).toEqual({ error: null, success: true });
    expect(mockSaveOrdenArchivo).toHaveBeenCalledWith("taller", "o1", "firma", expect.any(File));
    // Condicional: solo entra si el acta seguía sin firmar.
    expect(tx.actaEntrega.updateMany).toHaveBeenCalledWith({
      where: { ordenId: "o1", firmadaAt: null },
      data: expect.objectContaining({
        recibidoPor: "María",
        firmaUrl: "/api/uploads/taller/ordenes/o1/firma/f.png",
        firmaFotoUrl: null,
        firmadaAt: expect.any(Date),
      }),
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: "ACTA_FIRMAR", entidadId: "a1" }),
    });
  });

  it("si otra pestaña firmó primero, no pisa la firma y limpia su archivo", async () => {
    db.ordenTrabajo.findFirst.mockResolvedValue({
      id: "o1",
      estado: "ENTREGADA",
      acta: { id: "a1", firmadaAt: null, firmaUrl: null, firmaFotoUrl: null },
    });
    tx.actaEntrega.updateMany.mockResolvedValue({ count: 0 });
    tx.actaEntrega.findFirst.mockResolvedValue({ id: "a1" });

    const r = await firmarActaAction("o1", inicial, fd({ recibidoPor: "María", firma: firmaPng() }));

    expect(r.error).toBe("El acta ya está firmada");
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(mockBorrarUpload).toHaveBeenCalledWith("taller", "/api/uploads/taller/ordenes/o1/firma/f.png");
  });

  it("si la orden se entregó sin acta, firmarla la crea (arregla el estado)", async () => {
    db.ordenTrabajo.findFirst.mockResolvedValue({ id: "o1", estado: "ENTREGADA", acta: null });
    tx.actaEntrega.updateMany.mockResolvedValue({ count: 0 });
    tx.actaEntrega.findFirst.mockResolvedValue(null);

    const r = await firmarActaAction("o1", inicial, fd({ recibidoPor: "María", firma: firmaPng() }));

    expect(r).toEqual({ error: null, success: true });
    expect(tx.actaEntrega.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ordenId: "o1", recibidoPor: "María", creadoPorId: "u1", firmadaAt: expect.any(Date) }),
      select: { id: true },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: "ACTA_FIRMAR", entidadId: "a-nueva" }),
    });
  });

  it("no firma una orden de otra sede", async () => {
    db.ordenTrabajo.findFirst.mockResolvedValue(null);

    const r = await firmarActaAction("ajena", inicial, fd({ recibidoPor: "M", firma: firmaPng() }));

    expect(r.error).toBe("Orden no encontrada");
    expect(mockSaveOrdenArchivo).not.toHaveBeenCalled();
    expect(db.ordenTrabajo.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ajena", sedeId: "sede-1" } }),
    );
  });

  it("quitar una garantía de otra sede no la encuentra, y pide rol de borrado", async () => {
    db.garantia.findFirst.mockResolvedValue(null);

    const r = await quitarGarantiaAction("g-ajena");

    expect(r.error).toBe("Garantía no encontrada");
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(db.garantia.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "g-ajena", orden: { sedeId: "sede-1" } } }),
    );
  });

  it("borra la firma anterior y el archivo nuevo si la escritura falla", async () => {
    db.ordenTrabajo.findFirst.mockResolvedValue({
      id: "o1",
      estado: "ENTREGADA",
      acta: { id: "a1", firmadaAt: null, firmaUrl: "/api/uploads/taller/ordenes/o1/firma/vieja.png", firmaFotoUrl: null },
    });
    tx.actaEntrega.updateMany.mockRejectedValue(new Error("boom"));

    const r = await firmarActaAction("o1", inicial, fd({ recibidoPor: "María", firma: firmaPng() }));

    expect(r.success).toBe(false);
    // El archivo recién guardado se limpia para no dejarlo huérfano.
    expect(mockBorrarUpload).toHaveBeenCalledWith("taller", "/api/uploads/taller/ordenes/o1/firma/f.png");
  });

  it("no firma fuera de ENTREGADA ni dos veces", async () => {
    db.ordenTrabajo.findFirst.mockResolvedValue({ id: "o1", estado: "EN_PROCESO", acta: null });
    expect((await firmarActaAction("o1", inicial, fd({ recibidoPor: "M", firma: firmaPng() }))).error).toContain(
      "se firma al entregar",
    );

    db.ordenTrabajo.findFirst.mockResolvedValue({
      id: "o1",
      estado: "ENTREGADA",
      acta: { id: "a1", firmadaAt: new Date(), firmaUrl: "x", firmaFotoUrl: null },
    });
    expect((await firmarActaAction("o1", inicial, fd({ recibidoPor: "M", firma: firmaPng() }))).error).toBe("El acta ya está firmada");
  });

  it("exige exactamente una firma", async () => {
    db.ordenTrabajo.findFirst.mockResolvedValue({
      id: "o1",
      estado: "ENTREGADA",
      acta: { id: "a1", firmadaAt: null, firmaUrl: null, firmaFotoUrl: null },
    });

    expect((await firmarActaAction("o1", inicial, fd({ recibidoPor: "M" }))).error).toBe("Falta la firma de quien recibe");
    const conDos = fd({ recibidoPor: "M", firma: firmaPng(), fotoActa: new File([new Uint8Array([1])], "acta.png", { type: "image/png" }) });
    expect((await firmarActaAction("o1", inicial, conDos)).error).toBe("Deja solo una firma: la de pantalla o la foto");
  });

  it("un acta firmada no se borra, y borrar el borrador limpia sus archivos", async () => {
    db.ordenTrabajo.findFirst.mockResolvedValue({
      id: "o1",
      estado: "ENTREGADA",
      factura: null,
      acta: { id: "a1", firmadaAt: new Date(), firmaUrl: "x", firmaFotoUrl: null },
    });
    expect((await borrarActaAction("o1")).error).toBe("Un acta firmada no se borra");

    // Una orden anulada no deja tocar el acta (una facturada sí: se entrega igual).
    db.ordenTrabajo.findFirst.mockResolvedValue({
      id: "o1",
      estado: "ANULADA",
      factura: null,
      acta: { id: "a1", firmadaAt: null, firmaUrl: null, firmaFotoUrl: null },
    });
    expect((await borrarActaAction("o1")).error).toContain("está anulada");

    db.ordenTrabajo.findFirst.mockResolvedValue({
      id: "o1",
      estado: "TERMINADA",
      factura: { id: "f1" },
      acta: { id: "a1", firmadaAt: null, firmaUrl: null, firmaFotoUrl: null },
    });
    expect(await borrarActaAction("o1")).toEqual({ error: null, success: true });

    db.ordenTrabajo.findFirst.mockResolvedValue({
      id: "o1",
      estado: "EN_PROCESO",
      factura: null,
      acta: { id: "a1", firmadaAt: null, firmaUrl: "/api/uploads/taller/ordenes/o1/firma/f.png", firmaFotoUrl: null },
    });
    expect(await borrarActaAction("o1")).toEqual({ error: null, success: true });
    // Condicional: no se borra un acta que ya se firmó entre la lectura y el borrado.
    expect(db.actaEntrega.deleteMany).toHaveBeenCalledWith({ where: { ordenId: "o1", firmadaAt: null } });
    expect(mockBorrarUpload).toHaveBeenCalledWith("taller", "/api/uploads/taller/ordenes/o1/firma/f.png");
  });

  it("si el acta cambió entre la lectura y el borrado, no borra nada", async () => {
    db.ordenTrabajo.findFirst.mockResolvedValue({
      id: "o1",
      estado: "EN_PROCESO",
      factura: null,
      acta: { id: "a1", firmadaAt: null, firmaUrl: null, firmaFotoUrl: null },
    });
    db.actaEntrega.deleteMany.mockResolvedValue({ count: 0 });

    const r = await borrarActaAction("o1");

    expect(r.error).toContain("El acta cambió");
    expect(mockBorrarUpload).not.toHaveBeenCalled();
  });

  it("borrar el acta pide rol de borrado y respeta la sede", async () => {
    await borrarActaAction("o1");

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(db.ordenTrabajo.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "o1", sedeId: "sede-1" } }),
    );
  });
});

describe("entregarOrdenAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(ADMIN);
    // Sin fila de configuración: el taller no exige la firma (valor por defecto).
    db.configuracionTaller.findUnique.mockResolvedValue(null);
    db.ordenTrabajo.findFirst.mockResolvedValue(ORDEN_MUTABLE);
    mockSaveOrdenArchivo.mockResolvedValue({ relativePath: "taller/ordenes/o1/firma/f.png", url: "/api/uploads/taller/ordenes/o1/firma/f.png" });
    mockBorrarUpload.mockResolvedValue(true);
    tx.ordenTrabajo.update.mockResolvedValue({});
    tx.ordenTrabajo.updateMany.mockResolvedValue({ count: 1 });
    tx.actaEntrega.upsert.mockResolvedValue({ id: "a1" });
    tx.actaEntrega.updateMany.mockResolvedValue({ count: 1 });
    tx.auditLog.create.mockResolvedValue({});
  });

  it("cambia a ENTREGADA y firma el acta en la misma transacción", async () => {
    const r = await entregarOrdenAction(
      "o1",
      { error: null, success: false },
      fd({ recibidoPor: "María", documentoRecibe: "1.020", observaciones: "Todo bien", firma: firmaPng() }),
    );

    expect(r).toEqual({ error: null, success: true });
    expect(tx.ordenTrabajo.updateMany).toHaveBeenCalledWith({
      where: { id: "o1", estado: "TERMINADA" },
      data: { estado: "ENTREGADA", entregadaAt: expect.any(Date) },
    });
    expect(tx.actaEntrega.upsert).toHaveBeenCalledWith({
      where: { ordenId: "o1" },
      create: expect.objectContaining({
        ordenId: "o1",
        recibidoPor: "María",
        firmaUrl: "/api/uploads/taller/ordenes/o1/firma/f.png",
        firmadaAt: expect.any(Date),
        creadoPorId: "u1",
      }),
      update: expect.objectContaining({ firmadaAt: expect.any(Date) }),
      select: { id: true },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      // El rastro apunta al acta de verdad, no a la orden.
      data: expect.objectContaining({ tipo: "ACTA_FIRMAR", entidadId: "a1" }),
    });
    // ENTREGADA no es notificable a propósito (`notificaciones/plantilla.ts`):
    // entregar se hace con el cliente en el mostrador.
  });

  it("si otra pestaña cambió el estado, no entrega y limpia su archivo", async () => {
    tx.ordenTrabajo.updateMany.mockResolvedValue({ count: 0 });

    const r = await entregarOrdenAction("o1", { error: null, success: false }, fd({ recibidoPor: "M", firma: firmaPng() }));

    expect(r.error).toContain("Otra persona ya cambió el estado");
    expect(tx.actaEntrega.upsert).not.toHaveBeenCalled();
    expect(mockBorrarUpload).toHaveBeenCalledWith("taller", "/api/uploads/taller/ordenes/o1/firma/f.png");
  });

  it("con la firma exigida por el taller, explica por qué no entrega sin ella", async () => {
    db.configuracionTaller.findUnique.mockResolvedValue({ exigirActaFirmada: true, usarControlCaja: false });

    const r = await entregarOrdenAction("o1", { error: null, success: false }, fd({ recibidoPor: "M" }));

    expect(r.error).toBe(
      "Este taller exige el acta firmada para entregar: firma en pantalla o sube la foto del acta firmada.",
    );
    expect(tx.ordenTrabajo.updateMany).not.toHaveBeenCalled();
  });

  it("exige el estado TERMINADA", async () => {

    db.ordenTrabajo.findFirst.mockResolvedValue({ ...ORDEN_MUTABLE, estado: "BORRADOR" });
    expect(
      (await entregarOrdenAction("o1", { error: null, success: false }, fd({ recibidoPor: "M", firma: firmaPng() }))).error,
    ).toBe("No se puede entregar una orden en estado BORRADOR");
  });

  it("rechaza una orden ya entregada o anulada, con el motivo real", async () => {
    db.ordenTrabajo.findFirst.mockResolvedValue({ ...ORDEN_MUTABLE, estado: "ENTREGADA" });
    expect(
      (await entregarOrdenAction("o1", { error: null, success: false }, fd({ recibidoPor: "M", firma: firmaPng() }))).error,
    ).toContain("ya está entregada");

    db.ordenTrabajo.findFirst.mockResolvedValue({ ...ORDEN_MUTABLE, estado: "ANULADA" });
    expect(
      (await entregarOrdenAction("o1", { error: null, success: false }, fd({ recibidoPor: "M", firma: firmaPng() }))).error,
    ).toContain("está anulada");
    expect(mockSaveOrdenArchivo).not.toHaveBeenCalled();
  });

  it("entrega una orden ya facturada (la factura no bloquea la entrega)", async () => {
    db.ordenTrabajo.findFirst.mockResolvedValue({ ...ORDEN_MUTABLE, factura: { id: "f1" } });

    const r = await entregarOrdenAction("o1", { error: null, success: false }, fd({ recibidoPor: "M", firma: firmaPng() }));

    expect(r).toEqual({ error: null, success: true });
    expect(tx.ordenTrabajo.updateMany).toHaveBeenCalledWith({
      where: { id: "o1", estado: "TERMINADA" },
      data: { estado: "ENTREGADA", entregadaAt: expect.any(Date) },
    });
  });

  it("sin firma y sin exigirla, entrega con un acta sin firmar y lo audita", async () => {
    const r = await entregarOrdenAction(
      "o1",
      { error: null, success: false },
      fd({ recibidoPor: "María", documentoRecibe: "", observaciones: "Recoge el hijo" }),
    );

    expect(r).toEqual({ error: null, success: true });
    expect(mockSaveOrdenArchivo).not.toHaveBeenCalled();
    expect(tx.ordenTrabajo.updateMany).toHaveBeenCalled();
    expect(tx.actaEntrega.upsert).toHaveBeenCalledWith({
      where: { ordenId: "o1" },
      create: {
        ordenId: "o1",
        recibidoPor: "María",
        documentoRecibe: null,
        observaciones: "Recoge el hijo",
        creadoPorId: "u1",
      },
      update: { recibidoPor: "María", documentoRecibe: null, observaciones: "Recoge el hijo" },
      select: { id: true },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: "ORDEN_ENTREGAR", entidadId: "o1" }),
    });
  });

  it("sin firma ni datos de quien recibe, entrega sin escribir el acta", async () => {
    const r = await entregarOrdenAction(
      "o1",
      { error: null, success: false },
      fd({ recibidoPor: "", documentoRecibe: "", observaciones: "" }),
    );

    expect(r).toEqual({ error: null, success: true });
    expect(tx.ordenTrabajo.updateMany).toHaveBeenCalled();
    expect(tx.actaEntrega.upsert).not.toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: "ORDEN_ENTREGAR" }),
    });
  });

  it("sin firma, unas observaciones sin el nombre de quien recibe no se pierden en silencio", async () => {
    const r = await entregarOrdenAction(
      "o1",
      { error: null, success: false },
      fd({ recibidoPor: "", observaciones: "Llanta de repuesto en el baúl" }),
    );

    expect(r.error).toBe("Escribe el nombre de quien recibe");
    expect(tx.ordenTrabajo.updateMany).not.toHaveBeenCalled();
  });

  it("si la transacción falla, no deja el archivo suelto y devuelve el error", async () => {
    tx.actaEntrega.upsert.mockRejectedValue({ code: "P2003" });

    const r = await entregarOrdenAction("o1", { error: null, success: false }, fd({ recibidoPor: "M", firma: firmaPng() }));

    expect(r.success).toBe(false);
    expect(r.error).toBeTruthy();
    expect(mockBorrarUpload).toHaveBeenCalledWith("taller", "/api/uploads/taller/ordenes/o1/firma/f.png");
  });

  it("acepta la firma dibujada en pantalla como data URL PNG", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");
    mockSaveOrdenArchivo.mockResolvedValue({ relativePath: "x", url: "/api/uploads/taller/ordenes/o1/firma/canvas.png" });

    const r = await entregarOrdenAction(
      "o1",
      { error: null, success: false },
      fd({ recibidoPor: "M", firmaDataUrl: `data:image/png;base64,${png}` }),
    );

    expect(r).toEqual({ error: null, success: true });
    const archivo = mockSaveOrdenArchivo.mock.calls[0]![3] as File;
    expect(archivo.type).toBe("image/png");
    expect(archivo.name).toBe("firma.png");
    expect(tx.actaEntrega.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ firmaUrl: "/api/uploads/taller/ordenes/o1/firma/canvas.png" }),
      }),
    );
  });

  it("rechaza un data URL que no es una imagen, y dos firmas a la vez", async () => {
    const invalido = await entregarOrdenAction(
      "o1",
      { error: null, success: false },
      fd({ recibidoPor: "M", firmaDataUrl: "data:text/plain;base64,aG9sYQ==" }),
    );
    expect(invalido.error).toBe("La firma no tiene un formato válido");

    const foto = new File([new Uint8Array([1])], "acta.jpg", { type: "image/jpeg" });
    const dos = await entregarOrdenAction(
      "o1",
      { error: null, success: false },
      fd({ recibidoPor: "M", firmaDataUrl: "data:image/png;base64,AAAA", fotoActa: foto }),
    );
    expect(dos.error).toBe("Deja solo una firma: la de pantalla o la foto");
    expect(mockSaveOrdenArchivo).not.toHaveBeenCalled();
  });

  it("acepta la foto del acta firmada en papel", async () => {
    const foto = new File([new Uint8Array([1])], "acta.jpg", { type: "image/jpeg" });
    mockSaveOrdenArchivo.mockResolvedValue({ relativePath: "x", url: "/api/uploads/taller/ordenes/o1/acta/a.jpg" });

    const r = await entregarOrdenAction("o1", { error: null, success: false }, fd({ recibidoPor: "M", fotoActa: foto }));

    expect(r.success).toBe(true);
    expect(mockSaveOrdenArchivo).toHaveBeenCalledWith("taller", "o1", "acta", foto);
    expect(tx.actaEntrega.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ firmaFotoUrl: "/api/uploads/taller/ordenes/o1/acta/a.jpg" }),
      }),
    );
  });
});

describe("garantías", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(ADMIN);
    db.ordenTrabajo.findFirst.mockResolvedValue({ id: "o1", estado: "EN_PROCESO", factura: null });
    db.manoDeObra.findFirst.mockResolvedValue({ id: "m1" });
    db.itemOrden.findFirst.mockResolvedValue({ id: "i1" });
    tx.garantia.create.mockResolvedValue({ id: "g1" });
    tx.garantia.delete.mockResolvedValue({});
    tx.auditLog.create.mockResolvedValue({});
  });

  it("registra una garantía de trabajo con su cobertura y la audita", async () => {
    const r = await agregarGarantiaAction(
      "o1",
      inicial,
      fd({ tipo: "TRABAJO", manoDeObraId: "m1", descripcion: "Cambio de aceite", cubreHasta: "2027-03-15", cubreHastaKm: "95000", nota: "" }),
    );

    expect(r).toEqual({ error: null, success: true });
    expect(db.manoDeObra.findFirst).toHaveBeenCalledWith({ where: { id: "m1", ordenId: "o1" }, select: { id: true } });
    expect(tx.garantia.create).toHaveBeenCalledWith({
      data: {
        ordenId: "o1",
        tipo: "TRABAJO",
        manoDeObraId: "m1",
        itemOrdenId: null,
        descripcion: "Cambio de aceite",
        cubreHasta: new Date("2027-03-15T00:00:00.000Z"),
        cubreHastaKm: 95000,
        nota: null,
        creadoPorId: "u1",
      },
      select: { id: true },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: "GARANTIA_REGISTRAR", entidadId: "g1" }),
    });
  });

  it("rechaza una línea que no es de la orden", async () => {
    db.manoDeObra.findFirst.mockResolvedValue(null);

    const r = await agregarGarantiaAction("o1", inicial, fd({ tipo: "TRABAJO", manoDeObraId: "m-otra", descripcion: "X" }));

    expect(r.error).toBe("Ese trabajo no pertenece a la orden");
    expect(tx.garantia.create).not.toHaveBeenCalled();
  });

  it("una garantía de repuesto usa el ítem y deja el trabajo en null", async () => {
    await agregarGarantiaAction("o1", inicial, fd({ tipo: "REPUESTO", itemOrdenId: "i1", descripcion: "Filtro" }));

    expect(tx.garantia.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipo: "REPUESTO", manoDeObraId: null, itemOrdenId: "i1" }) }),
    );
  });

  it("quitar una garantía audita y respeta la inmutabilidad", async () => {
    db.garantia.findFirst.mockResolvedValue({
      id: "g1",
      ordenId: "o1",
      orden: { estado: "EN_PROCESO", factura: null },
    });

    expect(await quitarGarantiaAction("g1")).toEqual({ error: null, success: true });
    expect(tx.garantia.delete).toHaveBeenCalledWith({ where: { id: "g1" } });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: "GARANTIA_ELIMINAR", entidadId: "g1" }),
    });

    db.garantia.findFirst.mockResolvedValue({ id: "g1", ordenId: "o1", orden: { estado: "ENTREGADA", factura: null } });
    expect((await quitarGarantiaAction("g1")).error).toContain("no se puede modificar");
  });

  it("con la orden ya facturada se puede registrar y quitar una garantía: se hace al entregar", async () => {
    // Lo normal es facturar y después entregar: las garantías siguen la regla del
    // acta (la factura no las bloquea), no la de los ítems.
    db.ordenTrabajo.findFirst.mockResolvedValue({ id: "o1", estado: "TERMINADA", factura: { id: "f1" } });
    const registrada = await agregarGarantiaAction(
      "o1",
      inicial,
      fd({ tipo: "TRABAJO", manoDeObraId: "m1", descripcion: "Frenos", cubreHasta: "2027-04-14" }),
    );
    expect(registrada).toEqual({ error: null, success: true });

    db.garantia.findFirst.mockResolvedValue({ id: "g1", ordenId: "o1", orden: { estado: "TERMINADA", factura: { id: "f1" } } });
    expect(await quitarGarantiaAction("g1")).toEqual({ error: null, success: true });
  });

  it("entregada o anulada, la orden ya no recibe garantías", async () => {
    for (const estado of ["ENTREGADA", "ANULADA"] as const) {
      db.ordenTrabajo.findFirst.mockResolvedValue({ id: "o1", estado, factura: null });
      const r = await agregarGarantiaAction("o1", inicial, fd({ tipo: "TRABAJO", manoDeObraId: "m1", descripcion: "X" }));
      expect(r.success).toBe(false);
    }
    expect(tx.garantia.create).not.toHaveBeenCalled();
  });

  it("lista las garantías del vehículo con su vigencia y su sede, sin filtrar por sede", async () => {
    db.vehiculo.findFirst.mockResolvedValue({ id: "v1", kilometraje: 96_000 });
    db.garantia.findMany.mockResolvedValue([
      {
        id: "g1",
        tipo: "TRABAJO",
        descripcion: "Cambio de aceite",
        cubreHasta: new Date("2020-01-01T00:00:00.000Z"),
        cubreHastaKm: null,
        nota: null,
        createdAt: new Date("2020-01-01T00:00:00.000Z"),
        orden: { id: "o1", sedeId: "sede-1", sede: { nombre: "Sede principal" } },
        manoDeObra: { descripcion: "Cambio de aceite" },
        itemOrden: null,
      },
      {
        id: "g2",
        tipo: "REPUESTO",
        descripcion: "Filtro",
        cubreHasta: null,
        cubreHastaKm: 95_000,
        nota: "Sin cobertura por fecha",
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
        orden: { id: "o2", sedeId: "sede-2", sede: { nombre: "Sede norte" } },
        manoDeObra: null,
        itemOrden: { descripcion: "Filtro de aceite" },
      },
    ]);

    const garantias = await listGarantiasDeVehiculo("v1");

    expect(db.garantia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orden: { vehiculoId: "v1" } } }),
    );
    expect(garantias[0]).toMatchObject({ estado: "VENCIDA", linea: "Cambio de aceite", sede: "Sede principal", ordenId: "o1" });
    expect(garantias[1]).toMatchObject({ estado: "VENCIDA", linea: "Filtro de aceite", sede: "Sede norte" });
  });

  it("sin vehículo no hay garantías que listar", async () => {
    db.vehiculo.findFirst.mockResolvedValue(null);

    expect(await listGarantiasDeVehiculo("nope")).toEqual([]);
    expect(db.garantia.findMany).not.toHaveBeenCalled();
  });
});
