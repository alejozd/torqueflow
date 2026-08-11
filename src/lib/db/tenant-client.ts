import { PrismaClient as TenantPrismaClient } from "@/generated/prisma-tenant";

export type { TenantPrismaClient };

/**
 * Maximum number of tenant Prisma clients kept alive at once. Combined with
 * TENANT_DB_CONNECTION_LIMIT (each client's own Postgres pool size), this
 * bounds the total connections this process can hold open to roughly
 * MAX_CACHED_TENANT_CLIENTS * TENANT_DB_CONNECTION_LIMIT — regardless of how
 * many distinct tenant schemas have been touched over the app's lifetime.
 */
export const MAX_CACHED_TENANT_CLIENTS = 20;

const DEFAULT_TENANT_DB_CONNECTION_LIMIT = 5;

/**
 * Simple, framework-agnostic LRU cache built on Map's insertion-order
 * guarantee: the front of the map is the least-recently-used entry, the
 * back is the most-recently-used. Kept independent of TenantPrismaClient so
 * its get/set/evict semantics can be unit-tested with plain values.
 */
export class LruCache<K, V> {
  private readonly map = new Map<K, V>();

  constructor(
    private readonly maxSize: number,
    private readonly onEvict?: (key: K, value: V) => void,
  ) {}

  get size(): number {
    return this.map.size;
  }

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;

    // Mark as most-recently-used by moving it to the end of insertion order.
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      const oldestKey = this.map.keys().next().value as K | undefined;
      if (oldestKey !== undefined) {
        const oldestValue = this.map.get(oldestKey) as V;
        this.map.delete(oldestKey);
        this.onEvict?.(oldestKey, oldestValue);
      }
    }
    this.map.set(key, value);
  }
}

function resolveTenantConnectionLimit(): number {
  const raw = process.env.TENANT_DB_CONNECTION_LIMIT;
  const parsed = raw === undefined ? NaN : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TENANT_DB_CONNECTION_LIMIT;
}

export function buildTenantConnectionString(schemaName: string): string {
  const base = process.env.TENANT_DATABASE_BASE_URL;
  if (!base) {
    throw new Error("TENANT_DATABASE_BASE_URL is not set");
  }
  const separator = base.includes("?") ? "&" : "?";
  const schemaParam = `schema=${encodeURIComponent(schemaName)}`;
  const connectionLimitParam = `connection_limit=${resolveTenantConnectionLimit()}`;
  return `${base}${separator}${schemaParam}&${connectionLimitParam}`;
}

export function disconnectEvictedClient(schemaName: string, client: TenantPrismaClient): void {
  client.$disconnect().catch((error: unknown) => {
    console.error(`[tenant-client] Failed to disconnect evicted client for schema "${schemaName}":`, error);
  });
}

function createTenantClientCache(): LruCache<string, TenantPrismaClient> {
  return new LruCache<string, TenantPrismaClient>(MAX_CACHED_TENANT_CLIENTS, disconnectEvictedClient);
}

declare global {
  // eslint-disable-next-line no-var
  var __torqueflowTenantClients: LruCache<string, TenantPrismaClient> | undefined;
}

const tenantClientCache: LruCache<string, TenantPrismaClient> =
  globalThis.__torqueflowTenantClients ?? createTenantClientCache();

if (process.env.NODE_ENV !== "production") {
  globalThis.__torqueflowTenantClients = tenantClientCache;
}

export function getTenantDb(schemaName: string): TenantPrismaClient {
  const cached = tenantClientCache.get(schemaName);
  if (cached) return cached;

  const client = new TenantPrismaClient({
    datasourceUrl: buildTenantConnectionString(schemaName),
  });
  tenantClientCache.set(schemaName, client);
  return client;
}
