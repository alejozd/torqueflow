import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockUpsert = vi.fn();
const mockDviFindUnique = vi.fn();
const mockFotoCreate = vi.fn();
const mockFotoDeleteMany = vi.fn();
const mockOrdenFindUnique = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    dvi: { upsert: mockUpsert, findUnique: mockDviFindUnique },
    dviFoto: { create: mockFotoCreate, deleteMany: mockFotoDeleteMany },
    ordenTrabajo: { findUnique: mockOrdenFindUnique },
  }),
}));

const mockSaveDviFoto = vi.fn();
vi.mock("@/lib/storage/local-file-storage", () => ({
  saveDviFoto: (...args: unknown[]) => mockSaveDviFoto(...args),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  updateDviChecklistAction,
  addDviFotoAction,
  deleteDviFotoAction,
  type DviFormState,
} from "./dvi-actions";

const initialState: DviFormState = { error: null, success: false };

describe("updateDviChecklistAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { id: "u1", role: "TECNICO", tenantSchema: "taller_perez" } });
    mockUpsert.mockReset();
    mockOrdenFindUnique.mockReset().mockResolvedValue({ estado: "EN_PROCESO" });
  });

  it("upserts only the recognized checklist keys with valid statuses", async () => {
    mockUpsert.mockResolvedValue({ id: "d1" });
    const formData = new FormData();
    formData.set("frenos", "OK");
    formData.set("luces", "ATENCION");
    formData.set("not_a_real_key", "OK");
    formData.set("bateria", "not_a_real_status");

    const result = await updateDviChecklistAction("o1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { ordenId: "o1" },
      create: { ordenId: "o1", checklist: { frenos: "OK", luces: "ATENCION" }, creadoPorId: "u1" },
      update: { checklist: { frenos: "OK", luces: "ATENCION" } },
    });
  });

  it("blocks updating the checklist when the order is in a terminal state (ENTREGADA)", async () => {
    mockOrdenFindUnique.mockResolvedValue({ estado: "ENTREGADA" });
    const formData = new FormData();
    formData.set("frenos", "OK");

    const result = await updateDviChecklistAction("o1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("No se puede modificar una orden en estado ENTREGADA.");
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe("addDviFotoAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { id: "u1", role: "TECNICO", tenantSchema: "taller_perez" } });
    mockDviFindUnique.mockReset();
    mockFotoCreate.mockReset();
    mockSaveDviFoto.mockReset();
    mockOrdenFindUnique.mockReset().mockResolvedValue({ estado: "EN_PROCESO" });
  });

  it("returns an error when no checklist (Dvi record) exists yet", async () => {
    mockDviFindUnique.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("momento", "ANTES");
    formData.set("foto", new File(["x"], "foto.jpg", { type: "image/jpeg" }));

    const result = await addDviFotoAction("o1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Primero guarda el checklist de inspección");
    expect(mockSaveDviFoto).not.toHaveBeenCalled();
  });

  it("saves the file and creates the DviFoto row on valid input", async () => {
    mockDviFindUnique.mockResolvedValue({ id: "d1" });
    mockSaveDviFoto.mockResolvedValue({ url: "/api/uploads/taller_perez/dvi/d1/abc.jpg" });
    mockFotoCreate.mockResolvedValue({ id: "f1" });
    const formData = new FormData();
    formData.set("momento", "DESPUES");
    formData.set("foto", new File(["x"], "foto.jpg", { type: "image/jpeg" }));

    const result = await addDviFotoAction("o1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockFotoCreate).toHaveBeenCalledWith({
      data: { dviId: "d1", momento: "DESPUES", url: "/api/uploads/taller_perez/dvi/d1/abc.jpg" },
    });
  });

  it("propagates the storage error message when saveDviFoto rejects", async () => {
    mockDviFindUnique.mockResolvedValue({ id: "d1" });
    mockSaveDviFoto.mockRejectedValue(new Error("Tipo de archivo no permitido: application/pdf"));
    const formData = new FormData();
    formData.set("momento", "ANTES");
    formData.set("foto", new File(["x"], "doc.pdf", { type: "application/pdf" }));

    const result = await addDviFotoAction("o1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Tipo de archivo no permitido: application/pdf");
    expect(mockFotoCreate).not.toHaveBeenCalled();
  });

  it("blocks adding a foto when the order is in a terminal state (ENTREGADA)", async () => {
    mockOrdenFindUnique.mockResolvedValue({ estado: "ENTREGADA" });
    const formData = new FormData();
    formData.set("momento", "ANTES");
    formData.set("foto", new File(["x"], "foto.jpg", { type: "image/jpeg" }));

    const result = await addDviFotoAction("o1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("No se puede modificar una orden en estado ENTREGADA.");
    expect(mockSaveDviFoto).not.toHaveBeenCalled();
  });
});

describe("deleteDviFotoAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockFotoDeleteMany.mockReset();
    mockOrdenFindUnique.mockReset().mockResolvedValue({ estado: "EN_PROCESO" });
  });

  it("requires ADMIN/RECEPCION (not TECNICO) to delete a foto", async () => {
    mockFotoDeleteMany.mockResolvedValue({ count: 1 });

    await deleteDviFotoAction("f1", "o1");

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(mockFotoDeleteMany).toHaveBeenCalledWith({ where: { id: "f1", dvi: { ordenId: "o1" } } });
  });

  it("blocks deleting a foto when the order is in a terminal state (ENTREGADA)", async () => {
    mockOrdenFindUnique.mockResolvedValue({ estado: "ENTREGADA" });

    await expect(deleteDviFotoAction("f1", "o1")).rejects.toThrow(
      "No se puede modificar una orden en estado ENTREGADA.",
    );
    expect(mockFotoDeleteMany).not.toHaveBeenCalled();
  });

  it("throws when the foto exists but belongs to a different orden", async () => {
    mockFotoDeleteMany.mockResolvedValue({ count: 0 });

    await expect(deleteDviFotoAction("f1", "o1")).rejects.toThrow("Foto no encontrada en esta orden");
  });
});
