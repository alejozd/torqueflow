import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireSuperAdmin = vi.fn();
vi.mock("@/lib/super-admin/guards", () => ({
  requireSuperAdmin: (...args: unknown[]) => mockRequireSuperAdmin(...args),
}));

const mockTenantFindMany = vi.fn();
const mockTenantFindUnique = vi.fn();
vi.mock("@/lib/db/public-client", () => ({
  publicDb: {
    tenant: {
      findMany: (...a: unknown[]) => mockTenantFindMany(...a),
      findUnique: (...a: unknown[]) => mockTenantFindUnique(...a),
    },
  },
}));

const dbs: Record<string, { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> }> = {};
function dbDe(schema: string) {
  dbs[schema] ??= { findUnique: vi.fn(), upsert: vi.fn(), count: vi.fn() };
  return dbs[schema]!;
}
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: (schema: string) => {
    const d = dbDe(schema);
    return {
      configuracionFacturaElectronica: { findUnique: d.findUnique, upsert: d.upsert },
      documentoElectronico: { count: d.count },
    };
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { listFacturacionElectronicaTalleres, registrarTokenBolsaAction } from "./super-admin-fe-actions";
import { rangoMesBogota } from "@/lib/factura-electronica/rango-mes";

beforeEach(() => {
  process.env.SMTP_ENCRYPTION_KEY = "0".repeat(63) + "1";
  mockRequireSuperAdmin.mockReset().mockResolvedValue({ id: "sa" });
  mockTenantFindMany.mockReset();
  mockTenantFindUnique.mockReset();
  for (const k of Object.keys(dbs)) delete dbs[k];
});

describe("rangoMesBogota", () => {
  it("devuelve el mes en hora de Colombia", () => {
    const r = rangoMesBogota("2026-11");
    expect(r.desde.toISOString()).toBe("2026-11-01T05:00:00.000Z");
    expect(r.hasta.toISOString()).toBe("2026-12-01T05:00:00.000Z");
  });
  it("cruza el año en diciembre", () => {
    expect(rangoMesBogota("2026-12").hasta.toISOString()).toBe("2027-01-01T05:00:00.000Z");
  });
});

describe("listFacturacionElectronicaTalleres", () => {
  it("una fila por taller con su estado", async () => {
    mockTenantFindMany.mockResolvedValue([
      { id: "t1", slug: "a", nombre: "A", schemaName: "tenant_a" },
      { id: "t2", slug: "b", nombre: null, schemaName: "tenant_b" },
      { id: "t3", slug: "c", nombre: "C", schemaName: "tenant_c" },
    ]);
    dbDe("tenant_a").findUnique.mockResolvedValue({ activa: true, ambiente: "PRODUCCION", cuenta: "BOLSA", tokenCifrado: "v1:x" });
    dbDe("tenant_a").count.mockResolvedValue(7);
    dbDe("tenant_b").findUnique.mockResolvedValue(null);
    dbDe("tenant_c").findUnique.mockRejectedValue(new Error("relation does not exist"));

    const filas = await listFacturacionElectronicaTalleres("2026-11");

    expect(mockRequireSuperAdmin).toHaveBeenCalled();
    expect(filas).toHaveLength(3);
    expect(filas[0]).toMatchObject({ estado: "CONFIGURADA", tokenRegistrado: true, aceptadosMes: 7, cuenta: "BOLSA", activa: true });
    expect(dbDe("tenant_a").count).toHaveBeenCalledWith({
      where: {
        ambiente: "PRODUCCION",
        estado: { in: ["ACEPTADO", "ANULADO"] },
        createdAt: { gte: new Date("2026-11-01T05:00:00.000Z"), lt: new Date("2026-12-01T05:00:00.000Z") },
      },
    });
    expect(filas[1]).toMatchObject({ estado: "SIN_CONFIGURAR", aceptadosMes: 0 });
    expect(filas[2]).toMatchObject({ estado: "SIN_MIGRAR" });
  });
});

describe("registrarTokenBolsaAction", () => {
  const prev = { error: null, success: false };
  const form = (token: string) => {
    const f = new FormData();
    f.set("token", token);
    return f;
  };

  it("rechaza token vacío", async () => {
    const r = await registrarTokenBolsaAction("t1", prev, form("  "));
    expect(r).toEqual({ error: "Escribe el token.", success: false });
  });

  it("rechaza talleres con cuenta propia", async () => {
    mockTenantFindUnique.mockResolvedValue({ schemaName: "tenant_a" });
    dbDe("tenant_a").findUnique.mockResolvedValue({ cuenta: "PROPIA" });
    const r = await registrarTokenBolsaAction("t1", prev, form("tok"));
    expect(r).toEqual({ error: "Este taller usa su propia cuenta del proveedor.", success: false });
    expect(dbDe("tenant_a").upsert).not.toHaveBeenCalled();
  });

  it("guarda el token cifrado y no lo devuelve", async () => {
    mockTenantFindUnique.mockResolvedValue({ schemaName: "tenant_a" });
    dbDe("tenant_a").findUnique.mockResolvedValue(null);
    const r = await registrarTokenBolsaAction("t1", prev, form("secreto-123"));
    expect(r).toEqual({ error: null, success: true });
    const arg = dbDe("tenant_a").upsert.mock.calls[0]![0];
    expect(arg.create.tokenCifrado.startsWith("v1:")).toBe(true);
    expect(arg.create.cuenta).toBe("BOLSA");
    expect(JSON.stringify(r)).not.toContain("secreto-123");
  });
});
