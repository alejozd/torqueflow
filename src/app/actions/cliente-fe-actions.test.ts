import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequirePermiso = vi.fn();
vi.mock("@/lib/auth/guards", () => ({ requirePermiso: (...a: unknown[]) => mockRequirePermiso(...a) }));

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({ cliente: { findUnique: mockFindUnique, update: mockUpdate } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { calcularDvNit } from "@/modulos/factura-electronica";
import { guardarDatosFeClienteAction, type DatosFeClienteState } from "./cliente-fe-actions";

const inicial: DatosFeClienteState = { error: null, success: false };
function form(campos: Record<string, string>): FormData {
  const fd = new FormData();
  const base = { tipoDocumento: "", dv: "", tipoPersona: "", responsabilidadFiscal: "", municipioCodigo: "", direccion: "" };
  for (const [k, v] of Object.entries({ ...base, ...campos })) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePermiso.mockResolvedValue({ user: { tenantSchema: "taller_x" } });
});

describe("guardarDatosFeClienteAction", () => {
  it("pide editar clientes y guarda los datos", async () => {
    mockFindUnique.mockResolvedValue({ id: "c1", documento: "1020304050" });
    const r = await guardarDatosFeClienteAction(
      "c1",
      inicial,
      form({ tipoDocumento: "13", tipoPersona: "NATURAL", responsabilidadFiscal: "R-99-PN", municipioCodigo: "11001", direccion: "Cra 7" }),
    );
    expect(mockRequirePermiso).toHaveBeenCalledWith("clientes.editar");
    expect(r).toEqual({ error: null, success: true });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { tipoDocumento: "13", dv: null, tipoPersona: "NATURAL", responsabilidadFiscal: "R-99-PN", municipioCodigo: "11001", direccion: "Cra 7" },
    });
  });

  it("con NIT exige el DV correcto del documento del cliente", async () => {
    const nit = "900123456";
    mockFindUnique.mockResolvedValue({ id: "c1", documento: nit });
    const dvMalo = String((Number(calcularDvNit(nit)) + 1) % 10);
    const r = await guardarDatosFeClienteAction("c1", inicial, form({ tipoDocumento: "31", dv: dvMalo }));
    expect(r).toEqual({ error: "El dígito de verificación no corresponde al NIT del cliente.", success: false });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("con NIT y sin DV también lo pide", async () => {
    mockFindUnique.mockResolvedValue({ id: "c1", documento: "900123456" });
    const r = await guardarDatosFeClienteAction("c1", inicial, form({ tipoDocumento: "31" }));
    expect(r.error).toBe("Con NIT, escribe el dígito de verificación.");
  });

  it("cliente inexistente", async () => {
    mockFindUnique.mockResolvedValue(null);
    const r = await guardarDatosFeClienteAction("c9", inicial, form({}));
    expect(r).toEqual({ error: "El cliente no existe.", success: false });
  });
});
