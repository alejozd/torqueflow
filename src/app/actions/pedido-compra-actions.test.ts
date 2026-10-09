import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mockRequireSession = vi.fn();
const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireSession: () => mockRequireSession(),
  requireRole: (roles: string[]) => mockRequireRole(roles),
}));

const mockRevalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => mockRevalidatePath(path) }));

const mockEnviarEmail = vi.fn();
vi.mock("@/lib/email/enviar-email", () => ({ enviarEmail: (...args: unknown[]) => mockEnviarEmail(...args) }));
vi.mock("@/lib/email/smtp-config", () => ({
  CONFIGURACION_SMTP_ID: "singleton",
  descifrarConfiguracionSmtp: () => ({ fromNombre: "Taller Pérez", fromEmail: "taller@test" }),
}));
vi.mock("@/lib/db/public-client", () => ({
  publicDb: { tenant: { findUnique: vi.fn().mockResolvedValue({ nombre: "Taller Pérez", slug: "taller-perez" }) } },
}));

const repuesto = { findMany: vi.fn(), update: vi.fn() };
const pedidoCompra = { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() };
const entradaMercancia = { create: vi.fn() };
const configuracionSmtp = { findUnique: vi.fn() };
const tx = { repuesto, pedidoCompra, entradaMercancia };
const $transaction = vi.fn((fn: (cliente: typeof tx) => unknown) => fn(tx));

vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({ repuesto, pedidoCompra, entradaMercancia, configuracionSmtp, $transaction }),
}));

import {
  crearPedidosCompraAction,
  enviarPedidoCompraEmailAction,
  getEnlaceWhatsappPedido,
  recibirPedidoCompraAction,
  registrarEnvioWhatsappPedidoAction,
} from "./pedido-compra-actions";

const SEDE_ID = "sede-1";
const HOY = new Date("2026-10-09T15:00:00.000Z");
const sesion = { user: { id: "u1", tenantSchema: "taller_perez", sedeActivaId: SEDE_ID } };

function pedido(overrides: Record<string, unknown> = {}) {
  return {
    id: "pc1",
    numero: 7,
    estado: "BORRADOR",
    proveedor: { id: "p1", nombre: "Bosch", telefono: "3105550142", email: "pedidos@bosch.test", diasEntrega: 3 },
    bodega: { id: "b1", nombre: "Bodega principal" },
    creadoPor: { nombre: "Admin" },
    items: [
      { id: "i1", repuestoId: "r1", cantidad: 6, precioCompraUnitario: 1500, repuesto: { id: "r1", codigo: "FLT-001", nombre: "Filtro" } },
      { id: "i2", repuestoId: "r2", cantidad: 4, precioCompraUnitario: 900, repuesto: { id: "r2", codigo: "BJ-4", nombre: "Bujía" } },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  mockRequireSession.mockReset().mockResolvedValue(sesion);
  mockRequireRole.mockReset().mockResolvedValue(sesion);
  mockRevalidatePath.mockReset();
  mockEnviarEmail.mockReset().mockResolvedValue(undefined);
  for (const fn of [...Object.values(repuesto), ...Object.values(pedidoCompra), entradaMercancia.create, configuracionSmtp.findUnique]) {
    fn.mockReset();
  }
  $transaction.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(HOY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("crearPedidosCompraAction", () => {
  it("creates one BORRADOR pedido per proveedor and bodega at each repuesto's purchase price", async () => {
    repuesto.findMany.mockResolvedValue([
      { id: "r1", nombre: "Filtro", proveedorId: "p1", bodegaId: "b1", precioCompra: { toString: () => "1500" } },
      { id: "r2", nombre: "Bujía", proveedorId: "p1", bodegaId: "b1", precioCompra: { toString: () => "900" } },
      { id: "r3", nombre: "Correa", proveedorId: "p2", bodegaId: "b1", precioCompra: { toString: () => "5000" } },
    ]);
    pedidoCompra.create.mockResolvedValueOnce({ id: "pc1" }).mockResolvedValueOnce({ id: "pc2" });

    const resultado = await crearPedidosCompraAction([
      { repuestoId: "r1", cantidad: 6 },
      { repuestoId: "r2", cantidad: 4 },
      { repuestoId: "r3", cantidad: 2 },
    ]);

    expect(resultado).toEqual({ error: null, pedidoIds: ["pc1", "pc2"] });
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(repuesto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["r1", "r2", "r3"] }, bodega: { sedeId: SEDE_ID } } }),
    );
    expect(pedidoCompra.create).toHaveBeenNthCalledWith(1, {
      data: {
        proveedorId: "p1",
        bodegaId: "b1",
        creadoPorId: "u1",
        items: {
          create: [
            { repuestoId: "r1", cantidad: 6, precioCompraUnitario: 1500 },
            { repuestoId: "r2", cantidad: 4, precioCompraUnitario: 900 },
          ],
        },
      },
      select: { id: true },
    });
  });

  it("creates nothing when a repuesto has no proveedor", async () => {
    repuesto.findMany.mockResolvedValue([
      { id: "r1", nombre: "Filtro", proveedorId: "p1", bodegaId: "b1", precioCompra: 1 },
      { id: "r2", nombre: "Bujía", proveedorId: null, bodegaId: "b1", precioCompra: 1 },
    ]);

    const resultado = await crearPedidosCompraAction([
      { repuestoId: "r1", cantidad: 1 },
      { repuestoId: "r2", cantidad: 1 },
    ]);

    expect(resultado).toEqual({ error: "Asigna un proveedor antes de pedir: Bujía.", pedidoIds: [] });
    expect(pedidoCompra.create).not.toHaveBeenCalled();
  });

  it("rejects repuestos outside the sede", async () => {
    repuesto.findMany.mockResolvedValue([]);
    const resultado = await crearPedidosCompraAction([{ repuestoId: "ajeno", cantidad: 1 }]);
    expect(resultado.error).toBe("Algún repuesto no pertenece a tu sede activa.");
  });

  it("rejects an empty selection or non-positive quantities before touching the DB", async () => {
    expect((await crearPedidosCompraAction([])).error).toBe("Selecciona al menos un repuesto");
    expect((await crearPedidosCompraAction([{ repuestoId: "r1", cantidad: 0 }])).error).toBe("Las cantidades deben ser mayores que 0");
    expect(repuesto.findMany).not.toHaveBeenCalled();
  });
});

describe("enviarPedidoCompraEmailAction", () => {
  it("emails the proveedor and marks the pedido ENVIADO with its expected date", async () => {
    pedidoCompra.findFirst.mockResolvedValue(pedido());
    configuracionSmtp.findUnique.mockResolvedValue({ activo: true });

    const resultado = await enviarPedidoCompraEmailAction("pc1");

    expect(resultado).toEqual({ error: null });
    expect(pedidoCompra.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "pc1", bodega: { sedeId: SEDE_ID } } }));
    expect(mockEnviarEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ para: "pedidos@bosch.test", asunto: "Pedido de compra #7 — Taller Pérez" }),
    );
    expect(pedidoCompra.update).toHaveBeenCalledWith({
      where: { id: "pc1" },
      data: { estado: "ENVIADO", canal: "EMAIL", enviadoAt: HOY, fechaEsperada: new Date("2026-10-12T15:00:00.000Z") },
    });
  });

  it("keeps the original dates when resending an ENVIADO pedido", async () => {
    pedidoCompra.findFirst.mockResolvedValue(pedido({ estado: "ENVIADO" }));
    configuracionSmtp.findUnique.mockResolvedValue({ activo: true });

    await enviarPedidoCompraEmailAction("pc1");

    expect(pedidoCompra.update).toHaveBeenCalledWith({ where: { id: "pc1" }, data: { canal: "EMAIL" } });
  });

  it("does not mark the pedido as sent when SMTP is missing or the send fails", async () => {
    pedidoCompra.findFirst.mockResolvedValue(pedido());
    configuracionSmtp.findUnique.mockResolvedValue(null);
    expect((await enviarPedidoCompraEmailAction("pc1")).error).toMatch(/servidor SMTP no está configurado/);

    configuracionSmtp.findUnique.mockResolvedValue({ activo: true });
    mockEnviarEmail.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.5"));
    expect((await enviarPedidoCompraEmailAction("pc1")).error).toBe(
      "No se pudo enviar el pedido por correo. Revisa el servidor, el puerto y las credenciales.",
    );
    expect(pedidoCompra.update).not.toHaveBeenCalled();
  });

  it("asks for the proveedor's email when it has none", async () => {
    pedidoCompra.findFirst.mockResolvedValue(pedido({ proveedor: { ...pedido().proveedor, email: null } }));
    expect((await enviarPedidoCompraEmailAction("pc1")).error).toBe("El proveedor no tiene correo registrado. Agrégalo en Proveedores.");
  });
});

describe("WhatsApp", () => {
  it("builds the wa.me link with the pedido text", async () => {
    pedidoCompra.findFirst.mockResolvedValue(pedido());

    const url = await getEnlaceWhatsappPedido("pc1");

    expect(url).toMatch(/^https:\/\/wa\.me\/573105550142\?text=/);
    expect(decodeURIComponent(url!.split("text=")[1])).toContain("- 6 x Filtro (FLT-001)");
  });

  it("records the WhatsApp send", async () => {
    pedidoCompra.findFirst.mockResolvedValue(pedido());

    expect(await registrarEnvioWhatsappPedidoAction("pc1")).toEqual({ error: null });
    expect(pedidoCompra.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ estado: "ENVIADO", canal: "WHATSAPP" }) }));
  });

  it("refuses to send a received pedido", async () => {
    pedidoCompra.findFirst.mockResolvedValue(pedido({ estado: "RECIBIDO" }));
    expect((await registrarEnvioWhatsappPedidoAction("pc1")).error).toBe("Este pedido ya no se puede enviar.");
  });
});

describe("recibirPedidoCompraAction", () => {
  it("creates the entrada with what arrived, adds stock and closes the pedido", async () => {
    pedidoCompra.findFirst.mockResolvedValue(pedido({ estado: "ENVIADO" }));
    entradaMercancia.create.mockResolvedValue({ id: "e1" });
    pedidoCompra.updateMany.mockResolvedValue({ count: 1 });

    const resultado = await recibirPedidoCompraAction("pc1", [
      { itemId: "i1", cantidad: 5 },
      { itemId: "i2", cantidad: 0 },
    ]);

    expect(resultado).toEqual({ error: null, entradaId: "e1" });
    expect(entradaMercancia.create).toHaveBeenCalledWith({
      data: {
        proveedorId: "p1",
        bodegaId: "b1",
        creadoPorId: "u1",
        items: { create: [{ repuestoId: "r1", cantidad: 5, precioCompraUnitario: 1500 }] },
      },
      select: { id: true },
    });
    expect(repuesto.update).toHaveBeenCalledTimes(1);
    expect(repuesto.update).toHaveBeenCalledWith({ where: { id: "r1" }, data: { stockActual: { increment: 5 } } });
    expect(pedidoCompra.updateMany).toHaveBeenCalledWith({
      where: { id: "pc1", estado: "ENVIADO" },
      data: { estado: "RECIBIDO", recibidoAt: HOY, entradaId: "e1" },
    });
  });

  it("only receives ENVIADO pedidos", async () => {
    pedidoCompra.findFirst.mockResolvedValue(pedido({ estado: "BORRADOR" }));
    expect((await recibirPedidoCompraAction("pc1", [{ itemId: "i1", cantidad: 1 }])).error).toBe("Solo se puede recibir un pedido enviado.");
  });

  it("reports a concurrent reception instead of creating a second entrada", async () => {
    pedidoCompra.findFirst.mockResolvedValue(pedido({ estado: "ENVIADO" }));
    entradaMercancia.create.mockResolvedValue({ id: "e1" });
    pedidoCompra.updateMany.mockResolvedValue({ count: 0 });

    expect(await recibirPedidoCompraAction("pc1", [{ itemId: "i1", cantidad: 1 }])).toEqual({
      error: "Este pedido ya fue recibido.",
      entradaId: null,
    });
  });

  it("rejects items from another pedido and all-zero receptions", async () => {
    pedidoCompra.findFirst.mockResolvedValue(pedido({ estado: "ENVIADO" }));
    expect((await recibirPedidoCompraAction("pc1", [{ itemId: "otro", cantidad: 1 }])).error).toBe("Hay ítems que no pertenecen a este pedido.");
    expect((await recibirPedidoCompraAction("pc1", [{ itemId: "i1", cantidad: 0 }])).error).toBe("Indica al menos una cantidad recibida.");
  });
});
