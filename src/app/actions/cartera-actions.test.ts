import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({ requireRole: (...a: unknown[]) => mockRequireRole(...a), requireSession: vi.fn() }));
const db = { factura: { findMany: vi.fn() }, sede: { findUnique: vi.fn() } };
vi.mock("@/lib/db/tenant-client", () => ({ getTenantDb: () => db }));
vi.mock("@/lib/db/public-client", () => ({
  publicDb: { tenant: { findUnique: vi.fn().mockResolvedValue({ nombre: "Taller Pérez", slug: "taller-perez" }) } },
}));

import { getCartera } from "./cartera-actions";

const RECEPCION = { user: { id: "u2", role: "RECEPCION", tenantSchema: "t", sedeActivaId: "s1" } };
const ADMIN = { user: { id: "u1", role: "ADMIN", tenantSchema: "t", sedeActivaId: "s1" } };

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T15:00:00Z"));
  mockRequireRole.mockResolvedValue(RECEPCION);
  db.factura.findMany.mockResolvedValue([]);
});

afterEach(() => vi.useRealTimers());

describe("getCartera", () => {
  it("exige ADMIN o RECEPCION y consulta solo facturas pendientes con saldo de la sede", async () => {
    await getCartera({});
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
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
    mockRequireRole.mockResolvedValue(ADMIN);
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
});
