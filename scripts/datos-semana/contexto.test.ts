import { describe, expect, it } from "vitest";
import { cargarContexto, exigirSchemaPermitido, type TenantDb } from "./contexto";

const d = (n: number) => ({ toNumber: () => n });

function baseSimulada(over: Record<string, unknown[]> = {}) {
  const tablas: Record<string, unknown[]> = {
    usuario: [
      { id: "u-admin", nombre: "Admin", role: "ADMIN", sedes: [] },
      { id: "u-rec", nombre: "Recep", role: "RECEPCION", sedes: [] },
      { id: "u-tec", nombre: "Tec", role: "TECNICO", sedes: [{ sedeId: "s1" }] },
    ],
    sede: [{ id: "s1", nombre: "Principal" }],
    repuesto: [
      { id: "r1", nombre: "Filtro", precioCompra: d(10), precioVenta: d(20), stockActual: 5, stockMinimo: 2, bodegaId: "b1", proveedorId: null },
    ],
    servicio: [{ id: "sv1", nombre: "Cambio de aceite" }],
    proveedor: [],
    categoriaGasto: [],
    cliente: [
      { id: "c1", nombre: "Pedro Gómez", vehiculos: [{ id: "v1", placa: "ABC123" }] },
      { id: "c2", nombre: "Andrea Valencia Ríos", vehiculos: [{ id: "v2", placa: "ZZZ999" }] },
      { id: "c3", nombre: "Luisa Mora", vehiculos: [{ id: "v3", placa: "JKT482" }] },
    ],
    vehiculo: [{ placa: "ABC123" }, { placa: "ZZZ999" }, { placa: "JKT482" }],
    ...over,
  };
  const modelo = (k: string) => ({ findMany: async () => tablas[k] });
  return {
    usuario: modelo("usuario"), sede: modelo("sede"), repuesto: modelo("repuesto"),
    servicio: modelo("servicio"), proveedor: modelo("proveedor"),
    categoriaGasto: modelo("categoriaGasto"), cliente: modelo("cliente"), vehiculo: modelo("vehiculo"),
  } as unknown as TenantDb;
}

describe("exigirSchemaPermitido", () => {
  it("rechaza otros schemas", () => {
    expect(() => exigirSchemaPermitido("taller_prod")).toThrow(/Solo se permite taller_dev/);
  });
  it("acepta taller_dev", () => {
    expect(() => exigirSchemaPermitido("taller_dev")).not.toThrow();
  });
});

describe("cargarContexto", () => {
  it("falla sin mecánicos", async () => {
    const db = baseSimulada({ usuario: [{ id: "a", nombre: "A", role: "ADMIN", sedes: [] }] });
    await expect(cargarContexto(db, "taller_dev")).rejects.toThrow(/mecánico/);
  });
  it("falla sin ADMIN activo", async () => {
    const db = baseSimulada({ usuario: [{ id: "t", nombre: "T", role: "TECNICO", sedes: [] }] });
    await expect(cargarContexto(db, "taller_dev")).rejects.toThrow(/ADMIN/);
  });
  it("excluye al cliente y a las placas protegidas", async () => {
    const ctx = await cargarContexto(baseSimulada(), "taller_dev");
    expect(ctx.clientesExistentes).toEqual([
      { id: "c1", vehiculoIds: ["v1"] },
      { id: "c3", vehiculoIds: [] },
    ]);
  });
  it("placasOcupadas incluye todas, protegidas también", async () => {
    const ctx = await cargarContexto(baseSimulada(), "taller_dev");
    expect([...ctx.placasOcupadas].sort()).toEqual(["ABC123", "JKT482", "ZZZ999"]);
  });
  it("arma actores, mecánicos y convierte Decimal", async () => {
    const ctx = await cargarContexto(baseSimulada(), "taller_dev");
    expect(ctx.actorId).toBe("u-admin");
    expect(ctx.recepcionistaId).toBe("u-rec");
    expect(ctx.mecanicos).toEqual([{ id: "u-tec", nombre: "Tec", sedeIds: ["s1"] }]);
    expect(ctx.repuestos[0].precioVenta).toBe(20);
    expect(ctx.proveedores).toEqual([]);
  });
});
