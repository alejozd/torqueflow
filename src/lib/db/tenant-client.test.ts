import { afterEach, describe, expect, it, vi } from "vitest";
import { LruCache, buildTenantConnectionString, getTenantDb } from "./tenant-client";

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

  it("includes a connection_limit parameter in the built tenant connection string", () => {
    const connectionString = buildTenantConnectionString(TEST_SCHEMA);

    expect(connectionString).toMatch(/[?&]connection_limit=\d+/);
    expect(connectionString).toContain(`schema=${TEST_SCHEMA}`);
  });
});

describe("LruCache", () => {
  it("returns undefined for a key that was never set", () => {
    const cache = new LruCache<string, number>(2);
    expect(cache.get("missing")).toBeUndefined();
  });

  it("returns the same value reference on repeated gets (identity preserved by reordering)", () => {
    const cache = new LruCache<string, object>(3);
    const value = {};
    cache.set("a", value);

    expect(cache.get("a")).toBe(value);
    expect(cache.get("a")).toBe(value);
  });

  it("evicts the least-recently-used entry once maxSize is exceeded, invoking onEvict", () => {
    const onEvict = vi.fn();
    const cache = new LruCache<string, { id: string }>(2, onEvict);

    const a = { id: "a" };
    const b = { id: "b" };
    const c = { id: "c" };

    cache.set("a", a);
    cache.set("b", b);
    // Cache is full (size 2). Adding "c" must evict the oldest entry ("a").
    cache.set("c", c);

    expect(cache.size).toBe(2);
    expect(onEvict).toHaveBeenCalledTimes(1);
    expect(onEvict).toHaveBeenCalledWith("a", a);

    // "a" was evicted: a subsequent "get" must miss, proving that a new
    // value created for that key would NOT be the same reference as before.
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(b);
    expect(cache.get("c")).toBe(c);
  });

  it("does not evict a recently-used entry that was touched via get before the cache filled up", () => {
    const onEvict = vi.fn();
    const cache = new LruCache<string, { id: string }>(2, onEvict);

    const a = { id: "a" };
    const b = { id: "b" };
    const c = { id: "c" };

    cache.set("a", a);
    cache.set("b", b);
    cache.get("a"); // "a" is now most-recently-used; "b" becomes the oldest.
    cache.set("c", c); // Must evict "b", not "a".

    expect(onEvict).toHaveBeenCalledWith("b", b);
    expect(cache.get("a")).toBe(a);
    expect(cache.get("b")).toBeUndefined();
  });

  it("does not throw when onEvict is omitted", () => {
    const cache = new LruCache<string, number>(1);
    cache.set("a", 1);
    expect(() => cache.set("b", 2)).not.toThrow();
  });
});
