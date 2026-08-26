import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockCreate = vi.fn();
const mockFindMany = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({ cliente: { create: mockCreate, findMany: mockFindMany } }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createClienteAction, listClientes, type ClienteFormState } from "./cliente-actions";

const initialState: ClienteFormState = { error: null, success: false };

describe("createClienteAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockCreate.mockReset();
  });

  it("returns a validation error and does not touch the database when nombre is missing", async () => {
    const formData = new FormData();
    formData.set("nombre", "");

    const result = await createClienteAction(initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("El nombre es obligatorio");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the Cliente in the resolved tenant's schema on valid input", async () => {
    mockCreate.mockResolvedValue({ id: "c1", nombre: "Juan Pérez" });
    const formData = new FormData();
    formData.set("nombre", "Juan Pérez");
    formData.set("telefono", "555-1234");
    formData.set("email", "");
    formData.set("documento", "");

    const result = await createClienteAction(initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(mockCreate).toHaveBeenCalledWith({
      data: { nombre: "Juan Pérez", telefono: "555-1234", email: null, documento: null },
    });
  });

  it("returns a friendly Spanish message instead of the raw Prisma error on a unique constraint violation", async () => {
    mockCreate.mockRejectedValue({
      code: "P2002",
      message: "Unique constraint failed on the fields: (`documento`)",
    });
    const formData = new FormData();
    formData.set("nombre", "Juan Pérez");
    formData.set("telefono", "");
    formData.set("email", "");
    formData.set("documento", "12345");

    const result = await createClienteAction(initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Ya existe un registro con ese valor.");
    expect(result.error).not.toContain("Unique constraint");
  });

  it("propagates the redirect rejection and never touches the database when requireRole rejects (unauthorized)", async () => {
    mockRequireRole.mockReset().mockRejectedValue(new Error("REDIRECT:/login?error=forbidden"));
    const formData = new FormData();
    formData.set("nombre", "Juan Pérez");
    formData.set("telefono", "");
    formData.set("email", "");
    formData.set("documento", "");

    await expect(createClienteAction(initialState, formData)).rejects.toThrow(
      "REDIRECT:/login?error=forbidden",
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("listClientes", () => {
  beforeEach(() => {
    mockRequireSession.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockFindMany.mockReset();
  });

  it("lists clientes for the resolved tenant, ordered by nombre, with vehiculos/ordenes/facturas for the enriched columns", async () => {
    mockFindMany.mockResolvedValue([{ id: "c1", nombre: "Ana" }]);

    const result = await listClientes();

    expect(result).toEqual([{ id: "c1", nombre: "Ana" }]);
    expect(mockFindMany).toHaveBeenCalledWith({
      orderBy: { nombre: "asc" },
      include: {
        vehiculos: true,
        ordenes: { select: { updatedAt: true } },
        facturas: { where: { estado: "PENDIENTE" }, select: { saldoPendiente: true } },
      },
    });
  });
});
