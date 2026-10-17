import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequirePermiso = vi.fn();
vi.mock("@/lib/auth/guards", () => ({ requirePermiso: (...args: unknown[]) => mockRequirePermiso(...args) }));

import { GET } from "./route";

describe("GET /api/importacion/plantilla", () => {
  beforeEach(() => {
    mockRequirePermiso.mockReset().mockResolvedValue({ user: { id: "u1", role: "ADMIN" } });
  });

  it("exige ADMIN o RECEPCION antes de generar nada", async () => {
    await GET();

    expect(mockRequirePermiso).toHaveBeenCalledWith("importar.usar");
  });

  it("devuelve el xlsx como descarga con su nombre de archivo", async () => {
    const respuesta = await GET();

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(respuesta.headers.get("Content-Disposition")).toBe(
      'attachment; filename="plantilla-importacion-torqueflow.xlsx"',
    );
    expect(respuesta.headers.get("Cache-Control")).toBe("no-store");

    const bytes = new Uint8Array(await respuesta.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(1000);
    // Firma de un archivo ZIP, que es lo que es un xlsx por dentro.
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);
  });
});
