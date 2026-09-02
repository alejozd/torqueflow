import { describe, expect, it, beforeEach, vi } from "vitest";
import { seedClientes, NOMBRES, APELLIDOS } from "./seed-clientes";

vi.mock("@/lib/db/tenant-client");

describe("seedClientes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates clientes with deterministic documento format when none pre-exist", async () => {
    const { getTenantDb } = await import("@/lib/db/tenant-client");
    const mockClienteFindFirst = vi.fn().mockResolvedValue(null);
    const mockClienteCreate = vi.fn().mockResolvedValue({ id: "cli-1", documento: "1000000001" });

    (getTenantDb as any).mockReturnValue({
      cliente: { findFirst: mockClienteFindFirst, create: mockClienteCreate },
    });

    const result = await seedClientes({
      schemaName: "test_schema",
      count: 3,
    });

    expect(result.created).toBe(3);
    expect(result.skipped).toBe(0);
    expect(mockClienteCreate).toHaveBeenCalledTimes(3);

    // Verify deterministic documento format
    const firstCall = mockClienteCreate.mock.calls[0][0];
    expect(firstCall.data.documento).toBe("1000000000");

    const secondCall = mockClienteCreate.mock.calls[1][0];
    expect(secondCall.data.documento).toBe("1000000001");

    const thirdCall = mockClienteCreate.mock.calls[2][0];
    expect(thirdCall.data.documento).toBe("1000000002");
  });

  it("skips clientes that already exist (by documento) and counts them in skipped", async () => {
    const { getTenantDb } = await import("@/lib/db/tenant-client");
    const mockClienteFindFirst = vi.fn();
    const mockClienteCreate = vi.fn().mockResolvedValue({ id: "cli-1" });

    // First call (i=0, documento="1000000000"): returns null (doesn't exist) → create
    // Second call (i=1, documento="1000000001"): returns truthy (exists) → skip
    // Third call (i=2, documento="1000000002"): returns null (doesn't exist) → create
    mockClienteFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "existing-cli", documento: "1000000001" })
      .mockResolvedValueOnce(null);

    (getTenantDb as any).mockReturnValue({
      cliente: { findFirst: mockClienteFindFirst, create: mockClienteCreate },
    });

    const result = await seedClientes({
      schemaName: "test_schema",
      count: 3,
    });

    expect(result.created).toBe(2);
    expect(result.skipped).toBe(1);
    expect(mockClienteCreate).toHaveBeenCalledTimes(2);
    expect(mockClienteFindFirst).toHaveBeenCalledTimes(3);
  });

  it("generates nombres from NOMBRES and APELLIDOS vocabulary", async () => {
    const { getTenantDb } = await import("@/lib/db/tenant-client");
    const mockClienteFindFirst = vi.fn().mockResolvedValue(null);
    const mockClienteCreate = vi.fn().mockResolvedValue({ id: "cli-1" });

    (getTenantDb as any).mockReturnValue({
      cliente: { findFirst: mockClienteFindFirst, create: mockClienteCreate },
    });

    await seedClientes({
      schemaName: "test_schema",
      count: 5,
    });

    const nombres = mockClienteCreate.mock.calls.map((call) => call[0].data.nombre);

    // For i=0: NOMBRES[0] APELLIDOS[0] APELLIDOS[7%20]
    // For i=1: NOMBRES[1] APELLIDOS[1] APELLIDOS[8%20]
    // etc.
    expect(nombres[0]).toBe(`${NOMBRES[0]} ${APELLIDOS[0]} ${APELLIDOS[7]}`);
    expect(nombres[1]).toBe(`${NOMBRES[1]} ${APELLIDOS[1]} ${APELLIDOS[8]}`);

    // Verify all names follow the pattern
    nombres.forEach((nombre, index) => {
      const parts = nombre.split(" ");
      expect(parts.length).toBe(3); // nombre apellido1 apellido2

      const expectedNombre = NOMBRES[index % NOMBRES.length];
      const expectedApellido1 = APELLIDOS[index % APELLIDOS.length];
      const expectedApellido2 = APELLIDOS[(index + 7) % APELLIDOS.length];

      expect(nombre).toBe(`${expectedNombre} ${expectedApellido1} ${expectedApellido2}`);
    });
  });

  it("generates deterministic telefono starting with 3 and 10 digits total", async () => {
    const { getTenantDb } = await import("@/lib/db/tenant-client");
    const mockClienteFindFirst = vi.fn().mockResolvedValue(null);
    const mockClienteCreate = vi.fn().mockResolvedValue({ id: "cli-1" });

    (getTenantDb as any).mockReturnValue({
      cliente: { findFirst: mockClienteFindFirst, create: mockClienteCreate },
    });

    await seedClientes({
      schemaName: "test_schema",
      count: 5,
    });

    mockClienteCreate.mock.calls.forEach((call) => {
      const { telefono } = call[0].data;

      // Should start with 3
      expect(telefono[0]).toBe("3");

      // Should have exactly 10 digits
      expect(telefono.length).toBe(10);

      // Should be all digits
      expect(/^\d+$/.test(telefono)).toBe(true);
    });
  });

  it("generates deterministic email from nombre/apellido without accents", async () => {
    const { getTenantDb } = await import("@/lib/db/tenant-client");
    const mockClienteFindFirst = vi.fn().mockResolvedValue(null);
    const mockClienteCreate = vi.fn().mockResolvedValue({ id: "cli-1" });

    (getTenantDb as any).mockReturnValue({
      cliente: { findFirst: mockClienteFindFirst, create: mockClienteCreate },
    });

    await seedClientes({
      schemaName: "test_schema",
      count: 3,
    });

    mockClienteCreate.mock.calls.forEach((call) => {
      const { email, nombre } = call[0].data;

      // Email should be lowercase
      expect(email).toBe(email.toLowerCase());

      // Email should follow pattern: nombre.apellido{index}@example.com
      expect(email).toContain("@example.com");
      expect(email).toMatch(/^[a-z0-9.]+@example\.com$/);

      // Email should not contain accents (but names in database might)
      expect(/[áéíóúñ]/.test(email)).toBe(false);
    });
  });

  it("uses provided schemaName in getTenantDb call", async () => {
    const { getTenantDb } = await import("@/lib/db/tenant-client");
    const mockClienteFindFirst = vi.fn().mockResolvedValue(null);
    const mockClienteCreate = vi.fn().mockResolvedValue({ id: "cli-1" });

    (getTenantDb as any).mockReturnValue({
      cliente: { findFirst: mockClienteFindFirst, create: mockClienteCreate },
    });

    await seedClientes({
      schemaName: "custom_schema",
      count: 1,
    });

    expect(getTenantDb).toHaveBeenCalledWith("custom_schema");
  });

  it("calls findFirst with correct documento filter for each row", async () => {
    const { getTenantDb } = await import("@/lib/db/tenant-client");
    const mockClienteFindFirst = vi.fn().mockResolvedValue(null);
    const mockClienteCreate = vi.fn().mockResolvedValue({ id: "cli-1" });

    (getTenantDb as any).mockReturnValue({
      cliente: { findFirst: mockClienteFindFirst, create: mockClienteCreate },
    });

    await seedClientes({
      schemaName: "test_schema",
      count: 3,
    });

    // Verify findFirst was called with the correct documento for each iteration
    expect(mockClienteFindFirst.mock.calls[0][0]).toEqual({ where: { documento: "1000000000" } });
    expect(mockClienteFindFirst.mock.calls[1][0]).toEqual({ where: { documento: "1000000001" } });
    expect(mockClienteFindFirst.mock.calls[2][0]).toEqual({ where: { documento: "1000000002" } });
  });

  it("returns correct created and skipped counts", async () => {
    const { getTenantDb } = await import("@/lib/db/tenant-client");
    const mockClienteFindFirst = vi.fn();
    const mockClienteCreate = vi.fn().mockResolvedValue({ id: "cli-1" });

    // All exist
    mockClienteFindFirst.mockResolvedValue({ id: "existing" });

    (getTenantDb as any).mockReturnValue({
      cliente: { findFirst: mockClienteFindFirst, create: mockClienteCreate },
    });

    const result = await seedClientes({
      schemaName: "test_schema",
      count: 20,
    });

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(20);
    expect(mockClienteCreate).not.toHaveBeenCalled();
  });
});
