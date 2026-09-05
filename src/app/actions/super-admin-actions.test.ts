import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireSuperAdmin = vi.fn();
vi.mock("@/lib/super-admin/guards", () => ({
  requireSuperAdmin: () => mockRequireSuperAdmin(),
}));

const mockTenantFindMany = vi.fn();
const mockTenantUpdate = vi.fn();
const mockTenantDelete = vi.fn();
const mockPlanFindMany = vi.fn();
const mockExecuteRawUnsafe = vi.fn();
vi.mock("@/lib/db/public-client", () => ({
  publicDb: {
    tenant: {
      findMany: (...args: unknown[]) => mockTenantFindMany(...args),
      update: (...args: unknown[]) => mockTenantUpdate(...args),
      delete: (...args: unknown[]) => mockTenantDelete(...args),
    },
    plan: { findMany: (...args: unknown[]) => mockPlanFindMany(...args) },
    $executeRawUnsafe: (...args: unknown[]) => mockExecuteRawUnsafe(...args),
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockProvisionTenant = vi.fn();
vi.mock("../../../scripts/provision-tenant", () => ({
  provisionTenant: (...args: unknown[]) => mockProvisionTenant(...args),
}));

const mockSeedTenantUser = vi.fn();
vi.mock("../../../scripts/seed-tenant-user", () => ({
  seedTenantUser: (...args: unknown[]) => mockSeedTenantUser(...args),
}));

const mockUsuarioCount = vi.fn();
const mockGetTenantDb = vi.fn((_schemaName: string) => ({
  usuario: { count: (...args: unknown[]) => mockUsuarioCount(...args) },
}));
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: (schemaName: string) => mockGetTenantDb(schemaName),
}));

import {
  listTenantsConPlan,
  listPlanes,
  cambiarEstadoTenantAction,
  cambiarPlanTenantAction,
  crearTenantAction,
  contarUsuariosGlobal,
  type SuperAdminFormState,
  type CrearTenantResult,
} from "./super-admin-actions";
import { TenantUserEmailConflictError } from "@/lib/tenant/tenant-user-email";

const initialState: SuperAdminFormState = { error: null, success: false };
const initialCrearTenantState: CrearTenantResult = { error: null, credenciales: null };

function buildCrearTenantFormData(overrides: Partial<Record<string, string>> = {}): FormData {
  const formData = new FormData();
  const valores: Record<string, string> = {
    nombre: "Taller Familiar Gómez",
    slug: "taller-familiar",
    planId: "plan_basico",
    adminEmail: "admin@tallerfamiliar.test",
    adminNombre: "Juan Pérez",
    ...overrides,
  };
  for (const [key, value] of Object.entries(valores)) {
    formData.set(key, value);
  }
  return formData;
}

beforeEach(() => {
  mockRequireSuperAdmin.mockReset().mockResolvedValue({ id: "sa1", email: "owner@torqueflow.test", nombre: "Alejo" });
  mockTenantFindMany.mockReset();
  mockTenantUpdate.mockReset();
  mockTenantDelete.mockReset().mockResolvedValue({});
  mockPlanFindMany.mockReset();
  mockExecuteRawUnsafe.mockReset().mockResolvedValue(undefined);
  mockProvisionTenant.mockReset();
  mockSeedTenantUser.mockReset();
  mockUsuarioCount.mockReset();
  mockGetTenantDb.mockClear();
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

  it("propagates the redirect rejection and never queries the database when requireSuperAdmin rejects", async () => {
    mockRequireSuperAdmin.mockReset().mockRejectedValue(new Error("REDIRECT:/superadmin/login"));

    await expect(listTenantsConPlan()).rejects.toThrow("REDIRECT:/superadmin/login");
    expect(mockTenantFindMany).not.toHaveBeenCalled();
  });
});

describe("listPlanes", () => {
  it("requires a super-admin session and returns every plan", async () => {
    mockPlanFindMany.mockResolvedValue([{ id: "plan_basico", nombre: "Básico" }]);

    const planes = await listPlanes();

    expect(mockRequireSuperAdmin).toHaveBeenCalled();
    expect(planes).toHaveLength(1);
  });

  it("propagates the redirect rejection and never queries the database when requireSuperAdmin rejects", async () => {
    mockRequireSuperAdmin.mockReset().mockRejectedValue(new Error("REDIRECT:/superadmin/login"));

    await expect(listPlanes()).rejects.toThrow("REDIRECT:/superadmin/login");
    expect(mockPlanFindMany).not.toHaveBeenCalled();
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

  it("propagates the redirect rejection and never writes when requireSuperAdmin rejects", async () => {
    mockRequireSuperAdmin.mockReset().mockRejectedValue(new Error("REDIRECT:/superadmin/login"));
    const formData = new FormData();
    formData.set("estado", "SUSPENDIDO");

    await expect(cambiarEstadoTenantAction("t1", initialState, formData)).rejects.toThrow(
      "REDIRECT:/superadmin/login",
    );
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

  it("propagates the redirect rejection and never writes when requireSuperAdmin rejects", async () => {
    mockRequireSuperAdmin.mockReset().mockRejectedValue(new Error("REDIRECT:/superadmin/login"));
    const formData = new FormData();
    formData.set("planId", "plan_estandar");

    await expect(cambiarPlanTenantAction("t1", initialState, formData)).rejects.toThrow(
      "REDIRECT:/superadmin/login",
    );
    expect(mockTenantUpdate).not.toHaveBeenCalled();
  });
});

describe("crearTenantAction", () => {
  it("provisions the tenant and its admin user, returning a 12-character generated password", async () => {
    mockProvisionTenant.mockResolvedValue({ id: "t1" });
    mockSeedTenantUser.mockResolvedValue({ id: "u1" });

    const result = await crearTenantAction(initialCrearTenantState, buildCrearTenantFormData());

    expect(mockRequireSuperAdmin).toHaveBeenCalled();
    expect(mockProvisionTenant).toHaveBeenCalledWith({
      slug: "taller-familiar",
      schemaName: "taller_familiar",
      planId: "plan_basico",
      nombre: "Taller Familiar Gómez",
    });
    expect(mockSeedTenantUser).toHaveBeenCalledWith({
      schemaName: "taller_familiar",
      email: "admin@tallerfamiliar.test",
      password: expect.any(String),
      nombre: "Juan Pérez",
    });
    expect(result.error).toBeNull();
    expect(result.credenciales?.email).toBe("admin@tallerfamiliar.test");
    expect(result.credenciales?.password).toHaveLength(12);
  });

  it("rejects blank required fields without calling requireSuperAdmin or provisioning anything", async () => {
    const result = await crearTenantAction(initialCrearTenantState, buildCrearTenantFormData({ nombre: "" }));

    expect(result.error).toBe("El nombre del tenant es obligatorio");
    expect(mockRequireSuperAdmin).not.toHaveBeenCalled();
    expect(mockProvisionTenant).not.toHaveBeenCalled();
  });

  it("propagates the redirect rejection and never provisions when requireSuperAdmin rejects", async () => {
    mockRequireSuperAdmin.mockReset().mockRejectedValue(new Error("REDIRECT:/superadmin/login"));

    await expect(crearTenantAction(initialCrearTenantState, buildCrearTenantFormData())).rejects.toThrow(
      "REDIRECT:/superadmin/login",
    );
    expect(mockProvisionTenant).not.toHaveBeenCalled();
  });

  it("surfaces a duplicate-slug error from provisionTenant and never calls seedTenantUser", async () => {
    mockProvisionTenant.mockRejectedValue(new Error('Tenant already exists for slug "taller-familiar"'));

    const result = await crearTenantAction(initialCrearTenantState, buildCrearTenantFormData());

    expect(result.error).toMatch(/already exists/);
    expect(mockSeedTenantUser).not.toHaveBeenCalled();
  });

  it("hides an unrecognized provisioning failure behind a generic message", async () => {
    mockProvisionTenant.mockRejectedValue(new Error("ENOENT: some internal execSync detail"));

    const result = await crearTenantAction(initialCrearTenantState, buildCrearTenantFormData());

    expect(result.error).toBe("No se pudo crear el tenant, contactá soporte");
  });

  it("cleans up the orphaned tenant and schema when the admin email is already claimed by another tenant", async () => {
    mockProvisionTenant.mockResolvedValue({ id: "t1" });
    mockSeedTenantUser.mockRejectedValue(new TenantUserEmailConflictError("admin@tallerfamiliar.test"));

    const result = await crearTenantAction(initialCrearTenantState, buildCrearTenantFormData());

    expect(result.error).toBe("Este correo ya está registrado en otro taller.");
    expect(result.credenciales).toBeNull();
    expect(mockTenantDelete).toHaveBeenCalledWith({ where: { id: "t1" } });
    expect(mockExecuteRawUnsafe).toHaveBeenCalledWith('DROP SCHEMA IF EXISTS "taller_familiar" CASCADE');
  });
});

describe("contarUsuariosGlobal", () => {
  it("requires a super-admin session and sums usuario counts across every tenant schema", async () => {
    mockTenantFindMany.mockResolvedValue([{ schemaName: "taller_perez" }, { schemaName: "taller_gomez" }]);
    mockUsuarioCount
      .mockResolvedValueOnce(4) // taller_perez total
      .mockResolvedValueOnce(1) // taller_perez nuevos
      .mockResolvedValueOnce(7) // taller_gomez total
      .mockResolvedValueOnce(0); // taller_gomez nuevos

    const resultado = await contarUsuariosGlobal();

    expect(mockRequireSuperAdmin).toHaveBeenCalled();
    expect(mockGetTenantDb).toHaveBeenCalledWith("taller_perez");
    expect(mockGetTenantDb).toHaveBeenCalledWith("taller_gomez");
    expect(resultado).toEqual({ total: 11, nuevosUltimoMes: 1 });
  });

  it("returns zero counts when there are no tenants", async () => {
    mockTenantFindMany.mockResolvedValue([]);

    const resultado = await contarUsuariosGlobal();

    expect(resultado).toEqual({ total: 0, nuevosUltimoMes: 0 });
    expect(mockGetTenantDb).not.toHaveBeenCalled();
  });

  it("propagates the redirect rejection and never touches any tenant schema when requireSuperAdmin rejects", async () => {
    mockRequireSuperAdmin.mockReset().mockRejectedValue(new Error("REDIRECT:/superadmin/login"));

    await expect(contarUsuariosGlobal()).rejects.toThrow("REDIRECT:/superadmin/login");
    expect(mockTenantFindMany).not.toHaveBeenCalled();
    expect(mockGetTenantDb).not.toHaveBeenCalled();
  });
});
