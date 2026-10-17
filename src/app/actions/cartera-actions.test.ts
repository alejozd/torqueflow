import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRequirePermiso = vi.fn();
import { permisosEfectivos } from "@/lib/auth/permisos";
vi.mock("@/lib/auth/guards", () => ({ requirePermiso: (...a: unknown[]) => mockRequirePermiso(...a),
  requireSession: vi.fn(),
  puede: (session: { user: { permisos: string[] } }, permiso: string) => session.user.permisos.includes(permiso), }));
const db = { factura: { findMany: vi.fn() }, ventaMostrador: { findMany: vi.fn() }, sede: { findUnique: vi.fn() } };
vi.mock("@/lib/db/tenant-client", () => ({ getTenantDb: () => db }));
vi.mock("@/lib/db/public-client", () => ({
  publicDb: { tenant: { findUnique: vi.fn().mockResolvedValue({ nombre: "Taller Pérez", slug: "taller-perez" }) } },
}));

import { getCartera } from "./cartera-actions";

const RECEPCION = { user: { id: "u2", role: "RECEPCION", permisos: permisosEfectivos({ role: "RECEPCION" }), tenantSchema: "t", sedeActivaId: "s1" } };
const ADMIN = { user: { id: "u1", role: "ADMIN", permisos: permisosEfectivos({ role: "ADMIN" }), tenantSchema: "t", sedeActivaId: "s1" } };

function factura(id: string, numero: number, clienteId: string, nombre: string, telefono: string | null, emitida: string, saldo: string) {
  return {
    id,
    numero,
    total: { toString: () => saldo },
    saldoPendiente: { toString: () => saldo },
    createdAt: new Date(emitida),
    cliente: { id: clienteId, nombre, telefono },
  };
}

function venta(id: string, numero: number, cliente: { id: string; nombre: string; telefono: string | null } | null, creada: string, saldo: string) {
  return {
    id,
    numero,
    total: { toString: () => saldo },
    saldoPendiente: { toString: () => saldo },
    createdAt: new Date(creada),
    cliente,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T15:00:00Z"));
  mockRequirePermiso.mockResolvedValue(RECEPCION);
  db.factura.findMany.mockResolvedValue([]);
  db.ventaMostrador.findMany.mockResolvedValue([]);
});

afterEach(() => vi.useRealTimers());

describe("getCartera", () => {
  it("exige ADMIN o RECEPCION y consulta solo facturas pendientes con saldo de la sede", async () => {
    await getCartera({});
    expect(mockRequirePermiso).toHaveBeenCalledWith("cartera.ver");
    expect(db.factura.findMany.mock.calls[0][0].where).toEqual({
      estado: "PENDIENTE",
      saldoPendiente: { gt: 0 },
      orden: { sedeId: "s1" },
    });
  });

  it("RECEPCION no puede consultar otra sede", async () => {
    await getCartera({ sedeId: "s2" });
    expect(db.factura.findMany.mock.calls[0][0].where.orden).toEqual({ sedeId: "s1" });
  });

  it("ADMIN puede consultar otra sede", async () => {
    mockRequirePermiso.mockResolvedValue(ADMIN);
    await getCartera({ sedeId: "s2" });
    expect(db.factura.findMany.mock.calls[0][0].where.orden).toEqual({ sedeId: "s2" });
  });

  it("agrupa por cliente, calcula rangos y arma el enlace de cobro en el servidor", async () => {
    db.factura.findMany.mockResolvedValue([
      factura("f1", 10, "c1", "Ana", "3105550142", "2026-10-05T15:00:00Z", "100000"),
      factura("f2", 7, "c1", "Ana", "3105550142", "2026-07-01T15:00:00Z", "50000"),
      factura("f3", 12, "c2", "Luis", null, "2026-09-01T15:00:00Z", "300000"),
    ]);

    const r = await getCartera({});

    expect(r.sedeId).toBe("s1");
    expect(r.totales).toEqual({ "0-30": 100000, "31-60": 300000, "61-90": 0, "90+": 50000, total: 450000 });
    expect(r.clientes.map((c) => c.clienteNombre)).toEqual(["Luis", "Ana"]);
    const ana = r.clientes.find((c) => c.clienteId === "c1")!;
    expect(ana.saldoTotal).toBe(150000);
    expect(ana.urlWhatsapp).toMatch(/^https:\/\/wa\.me\/573105550142\?text=/);
    const texto = decodeURIComponent(ana.urlWhatsapp!.split("text=")[1]);
    expect(texto).toContain("Hola Ana");
    expect(texto).toContain("Taller Pérez");
    expect(texto).toContain("7, 10");
    expect(r.clientes.find((c) => c.clienteId === "c2")!.urlWhatsapp).toBeNull();
  });

  it("trae las ventas de mostrador con saldo de la misma sede", async () => {
    await getCartera({});
    expect(db.ventaMostrador.findMany.mock.calls[0][0].where).toEqual({
      estado: "PENDIENTE",
      saldoPendiente: { gt: 0 },
      sedeId: "s1",
    });
    mockRequirePermiso.mockResolvedValue(ADMIN);
    await getCartera({ sedeId: "s2" });
    expect(db.ventaMostrador.findMany.mock.calls[1][0].where.sedeId).toBe("s2");
  });

  it("normaliza las ventas de mostrador: origen, M-número, consumidor final, días y totales", async () => {
    db.factura.findMany.mockResolvedValue([factura("f1", 10, "c1", "Ana", "3105550142", "2026-10-05T15:00:00Z", "100000")]);
    db.ventaMostrador.findMany.mockResolvedValue([
      venta("v1", 5, null, "2026-09-01T15:00:00Z", "40000"),
      venta("v2", 6, { id: "c1", nombre: "Ana", telefono: "3105550142" }, "2026-10-10T15:00:00Z", "25000"),
    ]);

    const r = await getCartera({});

    expect(r.totales.total).toBe(165000);
    expect(r.totales["31-60"]).toBe(40000);
    const cf = r.clientes.find((c) => c.clienteNombre === "Consumidor final")!;
    expect(cf.urlWhatsapp).toBeNull();
    expect(cf.facturas[0]).toMatchObject({ origen: "MOSTRADOR", numero: 5, facturaId: "v1", dias: 44 });
    const ana = r.clientes.find((c) => c.clienteId === "c1")!;
    expect(ana.saldoTotal).toBe(125000);
    expect(ana.facturas.map((d) => d.origen).sort()).toEqual(["FACTURA", "MOSTRADOR"]);
    const texto = decodeURIComponent(ana.urlWhatsapp!.split("text=")[1]);
    expect(texto).toContain("factura 10");
    expect(texto).toContain("venta de mostrador M-6");
  });
});
