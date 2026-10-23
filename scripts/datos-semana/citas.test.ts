import { describe, expect, it, vi } from "vitest";
import { crearAzar } from "./azar";
import { registrarCita } from "./citas";
import type { Contexto } from "./contexto";
import type { EstadoEjecucion, TenantTx } from "./ejecutor";
import type { Evento, PlanDia } from "./tipos";

const dia: PlanDia = { fecha: "2026-10-20", sedeId: "s1", eventos: [] };
const ctx = {
  recepcionistaId: "rec1", clientesExistentes: [{ id: "e1", vehiculoIds: ["ev1"] }], placasOcupadas: new Set(),
} as unknown as Contexto;

async function correr(evento: Extract<Evento, { tipo: "cita" }>, semilla = 1) {
  const create = vi.fn(async (_a: unknown) => ({ id: "ci1" }));
  const tx = { cita: { create } } as unknown as TenantTx;
  const estado: EstadoEjecucion = {
    ordenes: new Map(), cajaAbierta: new Map(), creados: {},
    clientesCreados: [], clientesUsados: new Set(), citasPorOrden: new Map(), anticiposPendientes: [],
  };
  await registrarCita(tx, ctx, estado, dia, evento, crearAzar(semilla));
  const data = (create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
  return { data, estado };
}

describe("registrarCita", () => {
  it("cancelada queda CANCELADA y marcada", async () => {
    const { data } = await correr({ tipo: "cita", hora: "10:00", estado: "CANCELADA" });
    expect(data.estado).toBe("CANCELADA");
    expect(data.notas).toContain("[datos-semana]");
    expect(data.clienteId).toBe("e1");
    expect(data.createdAt).toEqual(new Date("2026-10-20T10:00:00-05:00"));
  });

  it("programada/confirmada se agenda 1 a 5 días después, nunca en domingo", async () => {
    for (let s = 1; s <= 30; s++) {
      const { data } = await correr({ tipo: "cita", hora: "10:00", estado: "CONFIRMADA" }, s);
      const f = data.fechaHora as Date;
      const dias = (f.getTime() - new Date("2026-10-20T00:00:00-05:00").getTime()) / 86_400_000;
      expect(dias).toBeGreaterThan(1);
      expect(dias).toBeLessThan(7);
      expect(new Date(f.getTime() - 5 * 3_600_000).getUTCDay()).not.toBe(0);
    }
  });

  it("completada con ordenClave guarda el par ordenClave a citaId", async () => {
    const { data, estado } = await correr({ tipo: "cita", hora: "09:00", estado: "COMPLETADA", ordenClave: "o-1" });
    expect(estado.citasPorOrden.get("o-1")).toBe("ci1");
    expect(data.fechaHora).toEqual(new Date("2026-10-20T09:00:00-05:00"));
  });
});
