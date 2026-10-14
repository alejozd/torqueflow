import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({ requireRole: (...args: unknown[]) => mockRequireRole(...args) }));

const mockGetCartera = vi.fn();
vi.mock("@/app/actions/cartera-actions", () => ({ getCartera: (...args: unknown[]) => mockGetCartera(...args) }));
const mockGetCuentas = vi.fn();
vi.mock("@/app/actions/cuenta-por-pagar-actions", () => ({
  getCuentasPorPagar: (...args: unknown[]) => mockGetCuentas(...args),
}));
const TENANT_DB = { soy: "la base del taller" };
const mockGetTenantDb = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({ getTenantDb: (...args: unknown[]) => mockGetTenantDb(...args) }));
const mockVentas = vi.fn();
const mockArqueos = vi.fn();
vi.mock("@/lib/exportacion/consultas", () => ({
  ventasDelRango: (...args: unknown[]) => mockVentas(...args),
  arqueosDelRango: (...args: unknown[]) => mockArqueos(...args),
}));

import { GET } from "./route";

const CARTERA_VACIA = {
  sedeId: "s1",
  clientes: [],
  totales: { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0, total: 0 },
};

function pedir(reporte: string, query = "") {
  return GET(new Request(`http://taller.test/api/exportar/${reporte}${query}`), {
    params: Promise.resolve({ reporte }),
  });
}

describe("GET /api/exportar/[reporte]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue({ user: { id: "u1", role: "ADMIN", tenantSchema: "taller", sedeActivaId: "sede-1" } });
    mockGetCartera.mockResolvedValue(CARTERA_VACIA);
    mockGetCuentas.mockResolvedValue({
      proveedores: [],
      totales: { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0, total: 0 },
    });
    mockGetTenantDb.mockReturnValue(TENANT_DB);
    mockVentas.mockResolvedValue([]);
    mockArqueos.mockResolvedValue([]);
  });

  it("devuelve un Excel con nombre de archivo y sin caché", async () => {
    const respuesta = await pedir("cartera");

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(respuesta.headers.get("Content-Disposition")).toMatch(/^attachment; filename="cartera-\d{4}-\d{2}-\d{2}\.xlsx"$/);
    expect(respuesta.headers.get("Cache-Control")).toBe("no-store");
    expect((await respuesta.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it("exige el rol que puede ver el dinero", async () => {
    mockRequireRole.mockRejectedValue(new Error("redirect:/login"));

    await expect(pedir("ventas", "?desde=2026-10-01&hasta=2026-10-05")).rejects.toThrow();
    expect(mockVentas).not.toHaveBeenCalled();
  });

  it("ignora una sede pedida por la URL: la sede y el taller salen de la sesión", async () => {
    await pedir("cartera", "?sedeId=sede-ajena");
    expect(mockGetCartera).toHaveBeenCalledWith({});

    await pedir("ventas", "?desde=2026-10-01&hasta=2026-10-05&sedeId=sede-ajena");
    expect(mockGetTenantDb).toHaveBeenCalledWith("taller");
    expect(mockVentas).toHaveBeenCalledWith(TENANT_DB, "sede-1", expect.anything());

    await pedir("arqueos", "?sedeId=sede-ajena");
    expect(mockArqueos).toHaveBeenCalledWith(TENANT_DB, "sede-1", expect.anything());
  });

  it("un reporte que no existe responde 404 (y con el rol ya comprobado); 'ventas-hoy' pasó a 'ventas'", async () => {
    expect((await pedir("inventario-valorizado")).status).toBe(404);
    expect((await pedir("ventas-hoy")).status).toBe(404);
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
  });

  it("ventas y arqueos usan el rango pedido, incluido el día 'hasta', y lo ponen en el nombre del archivo", async () => {
    const respuesta = await pedir("ventas", "?desde=2026-09-01&hasta=2026-09-30");

    expect(respuesta.status).toBe(200);
    expect(mockVentas).toHaveBeenCalledWith(TENANT_DB, "sede-1", {
      desde: "2026-09-01",
      hasta: "2026-09-30",
      gte: new Date("2026-09-01T05:00:00Z"),
      lt: new Date("2026-10-01T05:00:00Z"),
    });
    expect(respuesta.headers.get("Content-Disposition")).toBe(
      'attachment; filename="ventas-2026-09-01-a-2026-09-30.xlsx"',
    );

    expect((await pedir("arqueos", "?desde=2026-09-01&hasta=2026-09-30")).status).toBe(200);
    expect(mockArqueos).toHaveBeenCalledWith(TENANT_DB, "sede-1", expect.objectContaining({ desde: "2026-09-01" }));
  });

  it("sin fechas exporta el mes en curso", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-18T03:30:00Z"), toFake: ["Date"] });
    try {
      await pedir("arqueos");
    } finally {
      vi.useRealTimers();
    }

    expect(mockArqueos).toHaveBeenCalledWith(
      TENANT_DB,
      "sede-1",
      expect.objectContaining({ desde: "2026-10-01", hasta: "2026-10-17" }),
    );
  });

  it.each([
    ["formato inválido", "?desde=01-10-2026&hasta=2026-10-05"],
    ["desde posterior a hasta", "?desde=2026-10-05&hasta=2026-10-01"],
    ["rango de más de 366 días", "?desde=2024-01-01&hasta=2025-01-01"],
    ["solo una de las fechas", "?desde=2026-10-01"],
  ])("responde 400 con %s y no consulta nada", async (_caso, query) => {
    const respuesta = await pedir("ventas", query);

    expect(respuesta.status).toBe(400);
    expect(await respuesta.text()).not.toBe("");
    expect(mockVentas).not.toHaveBeenCalled();
  });

  it("cartera y cuentas por pagar no llevan rango: ignoran las fechas", async () => {
    expect((await pedir("cuentas-por-pagar", "?desde=basura")).status).toBe(200);
    expect(mockGetCuentas).toHaveBeenCalled();
  });
});
