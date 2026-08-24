import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireSuperAdmin = vi.fn();
vi.mock("@/lib/super-admin/guards", () => ({
  requireSuperAdmin: () => mockRequireSuperAdmin(),
}));

const mockTenantFindMany = vi.fn();
const mockTenantUpdate = vi.fn();
const mockPlanFindMany = vi.fn();
vi.mock("@/lib/db/public-client", () => ({
  publicDb: {
    tenant: { findMany: (...args: unknown[]) => mockTenantFindMany(...args), update: (...args: unknown[]) => mockTenantUpdate(...args) },
    plan: { findMany: (...args: unknown[]) => mockPlanFindMany(...args) },
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  listTenantsConPlan,
  listPlanes,
  cambiarEstadoTenantAction,
  cambiarPlanTenantAction,
  type SuperAdminFormState,
} from "./super-admin-actions";

const initialState: SuperAdminFormState = { error: null, success: false };

beforeEach(() => {
  mockRequireSuperAdmin.mockReset().mockResolvedValue({ id: "sa1", email: "owner@torqueflow.test", nombre: "Alejo" });
  mockTenantFindMany.mockReset();
  mockTenantUpdate.mockReset();
  mockPlanFindMany.mockReset();
});

describe("listTenantsConPlan", () => {
  it("requires a super-admin session and returns every tenant with its plan", async () => {
    mockTenantFindMany.mockResolvedValue([
      { id: "t1", slug: "taller-perez", estado: "ACTIVO", plan: { id: "plan_basico", nombre: "Básico" } },
    ]);

    const tenants = await listTenantsConPlan();

    expect(mockRequireSuperAdmin).toHaveBeenCalled();
    expect(tenants).toHaveLength(1);
    expect(tenants[0].plan.nombre).toBe("Básico");
  });
});

describe("cambiarEstadoTenantAction", () => {
  it("toggles a tenant's estado", async () => {
    mockTenantUpdate.mockResolvedValue({ id: "t1", estado: "SUSPENDIDO" });
    const formData = new FormData();
    formData.set("estado", "SUSPENDIDO");

    const result = await cambiarEstadoTenantAction("t1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockTenantUpdate).toHaveBeenCalledWith({ where: { id: "t1" }, data: { estado: "SUSPENDIDO" } });
  });

  it("rejects an estado value outside the fixed enum", async () => {
    const formData = new FormData();
    formData.set("estado", "BORRADO");

    const result = await cambiarEstadoTenantAction("t1", initialState, formData);

    expect(result.error).toBe("Estado inválido");
    expect(mockTenantUpdate).not.toHaveBeenCalled();
  });
});

describe("cambiarPlanTenantAction", () => {
  it("reassigns a tenant's plan", async () => {
    mockTenantUpdate.mockResolvedValue({ id: "t1", planId: "plan_estandar" });
    const formData = new FormData();
    formData.set("planId", "plan_estandar");

    const result = await cambiarPlanTenantAction("t1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockTenantUpdate).toHaveBeenCalledWith({ where: { id: "t1" }, data: { planId: "plan_estandar" } });
  });
});
