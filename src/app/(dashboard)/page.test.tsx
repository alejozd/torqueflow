import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { permisosEfectivos, type Role } from "@/lib/auth/permisos";

const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireSession: () => mockRequireSession(),
  puede: (session: { user: { permisos: string[] } }, permiso: string) => session.user.permisos.includes(permiso),
}));

const OVERVIEW_BASE = {
  enTaller: { total: 1, terminadasHoy: 0 },
  citasHoy: { total: 0, proxima: null },
  flujo: { borrador: 0, enProceso: 0, terminadas: 0, entregadasHoy: 0 },
  ordenesActivasCount: 0,
  ordenesRecientes: [],
  agendaHoy: [],
};
const mockOverview = vi.fn();
vi.mock("@/app/actions/dashboard-actions", () => ({ getDashboardOverview: () => mockOverview() }));
vi.mock("@/app/actions/alertas-inventario-actions", () => ({
  getAlertasInventario: async () => ({ resumen: { total: 2, sinDisponible: 1 }, alertas: [] }),
}));
vi.mock("@/app/actions/alertas-taller-actions", () => ({
  getAlertasTaller: async () => ({ diasUmbral: 3, alertas: [] }),
}));
vi.mock("@/app/actions/vencimiento-actions", () => ({ listVencimientos: async () => [] }));
vi.mock("./alertas-inventario-card", () => ({ AlertasInventarioCard: () => null }));
vi.mock("./alertas-taller-card", () => ({ AlertasTallerCard: () => null }));
vi.mock("./secciones-dashboard", () => ({ NavSeccionesDashboard: () => null }));
vi.mock("./facturacion-semana-card", () => ({ FacturacionSemanaCard: () => null }));

import InicioPage from "./page";
import { AlertasInventarioCard } from "./alertas-inventario-card";
import { FacturacionSemanaCard } from "./facturacion-semana-card";

function elementos(nodo: ReactNode, salida: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(nodo)) nodo.forEach((n) => elementos(n, salida));
  else if (nodo && typeof nodo === "object" && "props" in nodo) {
    const el = nodo as ReactElement<{ children?: ReactNode }>;
    salida.push(el);
    elementos(el.props.children, salida);
  }
  return salida;
}

async function cargar(role: Role) {
  mockRequireSession.mockResolvedValue({
    user: { role, permisos: permisosEfectivos({ role }), sedeActivaNombre: "Norte", name: "Ana" },
  });
  const completo = role !== "TECNICO";
  mockOverview.mockResolvedValue({
    ...OVERVIEW_BASE,
    porFacturar: completo ? { count: 3, monto: 900 } : null,
    cartera: completo ? { saldoPendiente: 500, facturasPendientes: 1, ventasMostradorPendientes: 0 } : null,
    facturacion: completo ? { dias: [], total: 0, pendiente: 0, totalSemanaAnterior: 0 } : null,
  });
  const todos = elementos(await InicioPage());
  return {
    kpis: todos
      .filter((e) => "title" in (e.props as object) && "value" in (e.props as object))
      .map((e) => (e.props as { title: string }).title),
    hay: (tipo: unknown) => todos.some((e) => e.type === tipo),
  };
}

describe("Inicio y la plata (D8)", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockOverview.mockReset();
  });

  it("TECNICO: sin Cartera, sin Por facturar, sin facturación semanal y sin tarjeta de alertas de inventario", async () => {
    const { kpis, hay } = await cargar("TECNICO");
    expect(kpis).not.toContain("Cartera");
    expect(kpis).not.toContain("Por facturar");
    expect(kpis).toContain("Stock bajo");
    expect(hay(FacturacionSemanaCard)).toBe(false);
    expect(hay(AlertasInventarioCard)).toBe(false);
  });

  it("RECEPCION: ve Cartera, Por facturar, facturación semanal y la tarjeta de alertas", async () => {
    const { kpis, hay } = await cargar("RECEPCION");
    expect(kpis).toEqual(expect.arrayContaining(["Cartera", "Por facturar"]));
    expect(hay(FacturacionSemanaCard)).toBe(true);
    expect(hay(AlertasInventarioCard)).toBe(true);
  });
});
