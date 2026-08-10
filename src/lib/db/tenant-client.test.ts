import { afterEach, describe, expect, it } from "vitest";
import { getTenantDb } from "./tenant-client";

const TEST_SCHEMA = "test_task5_fixture";

describe("getTenantDb", () => {
  afterEach(async () => {
    const tenantDb = getTenantDb(TEST_SCHEMA);
    await tenantDb.vehiculo.deleteMany({ where: { placa: "TEST-001" } });
    await tenantDb.cliente.deleteMany({ where: { nombre: "Cliente Fixture Task5" } });
  });

  it("returns a client that reads/writes the tenant schema, with Cliente-Vehiculo relations working", async () => {
    const tenantDb = getTenantDb(TEST_SCHEMA);

    const cliente = await tenantDb.cliente.create({
      data: { nombre: "Cliente Fixture Task5" },
    });

    const vehiculo = await tenantDb.vehiculo.create({
      data: { placa: "TEST-001", marca: "Toyota", modelo: "Corolla", clienteId: cliente.id },
    });

    const found = await tenantDb.cliente.findUnique({
      where: { id: cliente.id },
      include: { vehiculos: true },
    });

    expect(found?.vehiculos).toHaveLength(1);
    expect(found?.vehiculos[0].id).toBe(vehiculo.id);
  });

  it("caches and returns the same client instance for the same schema name", () => {
    expect(getTenantDb(TEST_SCHEMA)).toBe(getTenantDb(TEST_SCHEMA));
  });
});
