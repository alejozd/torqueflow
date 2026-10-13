import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({ requireRole: (...args: unknown[]) => mockRequireRole(...args) }));

const mockGetCartera = vi.fn();
vi.mock("@/app/actions/cartera-actions", () => ({ getCartera: (...args: unknown[]) => mockGetCartera(...args) }));
const mockGetCuentas = vi.fn();
vi.mock("@/app/actions/cuenta-por-pagar-actions", () => ({
  getCuentasPorPagar: (...args: unknown[]) => mockGetCuentas(...args),
}));
const mockGetMostrador = vi.fn();
vi.mock("@/app/actions/venta-mostrador-actions", () => ({
  getMostradorDatos: (...args: unknown[]) => mockGetMostrador(...args),
}));
const mockListCajas = vi.fn();
vi.mock("@/app/actions/caja-actions", () => ({ listCajasCerradas: (...args: unknown[]) => mockListCajas(...args) }));

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
    mockGetMostrador.mockResolvedValue({ cajaAbierta: true, repuestos: [], clientes: [], ventas: [] });
    mockListCajas.mockResolvedValue([]);
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

    await expect(pedir("cartera")).rejects.toThrow();
    expect(mockGetCartera).not.toHaveBeenCalled();
  });

  it("ignora una sede pedida por la URL: la sede sale de la sesión", async () => {
    await pedir("cartera", "?sedeId=sede-ajena");

    expect(mockGetCartera).toHaveBeenCalledWith({});
    expect(mockListCajas).not.toHaveBeenCalled();
  });

  it("un reporte que no existe responde 404 (y con el rol ya comprobado)", async () => {
    const respuesta = await pedir("inventario-valorizado");

    expect(respuesta.status).toBe(404);
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
  });

  it("arma cada uno de los cuatro reportes", async () => {
    expect((await pedir("cuentas-por-pagar")).status).toBe(200);
    expect(mockGetCuentas).toHaveBeenCalled();

    expect((await pedir("ventas-hoy")).status).toBe(200);
    expect(mockGetMostrador).toHaveBeenCalled();

    expect((await pedir("arqueos")).status).toBe(200);
    expect(mockListCajas).toHaveBeenCalledWith({});
  });
});
