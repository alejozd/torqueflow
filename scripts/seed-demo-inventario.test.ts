import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { crearAzar, proveedorDemoPara, seedDemoInventario } from "./seed-demo-inventario";

vi.mock("@/lib/db/tenant-client");

describe("proveedorDemoPara", () => {
  it("sends fluids to Terpel, then assigns by brand, else Autopartes Andina", () => {
    expect(proveedorDemoPara("Refrigerante NGK")).toBe("Terpel");
    expect(proveedorDemoPara("Aceite de motor 20W-50 Bosch")).toBe("Terpel");
    expect(proveedorDemoPara("Alternador Bosch")).toBe("Bosch Colombia");
    expect(proveedorDemoPara("Correa Gates")).toBe("Distribuidora Gates");
    expect(proveedorDemoPara("Filtro de aire Denso")).toBe("Autopartes Andina");
  });
});

describe("crearAzar", () => {
  it("is deterministic for the same seed", () => {
    const a = crearAzar(7);
    const b = crearAzar(7);
    expect([a.entero(1, 100), a.entero(1, 100)]).toEqual([b.entero(1, 100), b.entero(1, 100)]);
  });
});

describe("seedDemoInventario", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockDb(overrides: Record<string, unknown> = {}) {
    const db = {
      proveedor: {
        findFirst: vi.fn().mockResolvedValue({ id: "p" }),
        update: vi.fn().mockResolvedValue({ id: "p" }),
        create: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 4 }),
      },
      repuesto: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn(), updateMany: vi.fn() },
      sede: { findFirst: vi.fn().mockResolvedValue({ id: "s1" }) },
      usuario: { findFirst: vi.fn().mockResolvedValue({ id: "u1" }), findMany: vi.fn().mockResolvedValue([]) },
      vehiculo: { findMany: vi.fn().mockResolvedValue([{ id: "v1", clienteId: "c1" }]) },
      itemOrden: { findMany: vi.fn().mockResolvedValue([]) },
      // Both markers already present: history steps must be skipped.
      ordenTrabajo: { count: vi.fn().mockResolvedValue(36), create: vi.fn() },
      cliente: { updateMany: vi.fn().mockResolvedValue({ count: 22 }) },
      ...overrides,
    };
    return db;
  }

  it("does not duplicate history when its markers already exist, and sets the test email when asked", async () => {
    const { getTenantDb } = await import("@/lib/db/tenant-client");
    const db = mockDb();
    (getTenantDb as unknown as Mock).mockReturnValue(db);

    const resultado = await seedDemoInventario({ schemaName: "taller_dev", correoPruebas: "yo@test.com" });

    expect(db.ordenTrabajo.create).not.toHaveBeenCalled();
    expect(db.cliente.updateMany).toHaveBeenCalledWith({ data: { email: "yo@test.com" } });
    expect(db.proveedor.updateMany).toHaveBeenCalledWith({ data: { email: "yo@test.com" } });
    expect(resultado).toMatchObject({ ordenesConsumo: 0, ordenesRecientes: 0, correosActualizados: 26 });
  });

  it("assigns a proveedor only to repuestos without one", async () => {
    const { getTenantDb } = await import("@/lib/db/tenant-client");
    const db = mockDb();
    db.repuesto.findMany.mockResolvedValue([
      { id: "r1", nombre: "Alternador Bosch", proveedorId: null, stockActual: 9, stockMinimo: 2, precioCompra: 1, precioVenta: 2, bodegaId: "b1" },
      { id: "r2", nombre: "Correa Gates", proveedorId: "ya", stockActual: 9, stockMinimo: 2, precioCompra: 1, precioVenta: 2, bodegaId: "b1" },
    ]);
    (getTenantDb as unknown as Mock).mockReturnValue(db);

    const resultado = await seedDemoInventario({ schemaName: "taller_dev" });

    expect(resultado.proveedoresAsignados).toBe(1);
    expect(db.repuesto.update).toHaveBeenCalledWith({ where: { id: "r1" }, data: { proveedorId: "p" } });
    expect(db.cliente.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to invent history without a sede, an admin or vehículos", async () => {
    const { getTenantDb } = await import("@/lib/db/tenant-client");
    (getTenantDb as unknown as Mock).mockReturnValue(mockDb({ vehiculo: { findMany: vi.fn().mockResolvedValue([]) } }));

    await expect(seedDemoInventario({ schemaName: "vacio" })).rejects.toThrow(/at least one vehículo/);
  });
});
