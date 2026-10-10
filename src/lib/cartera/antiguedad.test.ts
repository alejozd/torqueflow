import { describe, expect, it } from "vitest";
import { agruparCartera, diasDesde, rangoDe, type FacturaCartera } from "./antiguedad";

const AHORA = new Date("2026-10-10T15:00:00-05:00");

function factura(p: Partial<FacturaCartera> & { facturaId: string }): FacturaCartera {
  return {
    numero: 1,
    clienteId: "c1",
    clienteNombre: "Cliente 1",
    clienteTelefono: null,
    emitidaAt: AHORA,
    total: 100,
    saldo: 100,
    ...p,
  };
}

describe("rangoDe", () => {
  it("respeta los bordes 30/31, 60/61 y 90/91", () => {
    expect(rangoDe(0)).toBe("0-30");
    expect(rangoDe(30)).toBe("0-30");
    expect(rangoDe(31)).toBe("31-60");
    expect(rangoDe(60)).toBe("31-60");
    expect(rangoDe(61)).toBe("61-90");
    expect(rangoDe(90)).toBe("61-90");
    expect(rangoDe(91)).toBe("90+");
  });
});

describe("diasDesde", () => {
  it("cuenta días calendario de Bogotá", () => {
    expect(diasDesde(new Date("2026-10-09T23:00:00-05:00"), new Date("2026-10-10T00:30:00-05:00"))).toBe(1);
  });
  it("una factura emitida a las 23:00 de Bogotá cuenta como ese día", () => {
    // 23:00 Bogotá = 04:00Z del día siguiente en UTC
    expect(diasDesde(new Date("2026-10-10T23:00:00-05:00"), new Date("2026-10-10T23:59:00-05:00"))).toBe(0);
  });
  it("nunca es negativo", () => {
    expect(diasDesde(new Date("2026-10-12T10:00:00-05:00"), AHORA)).toBe(0);
  });
});

describe("agruparCartera", () => {
  it("agrupa por cliente, totaliza por rango y ordena", () => {
    const dia = (n: number) => new Date(AHORA.getTime() - n * 86400000);
    const r = agruparCartera(
      [
        factura({ facturaId: "a", clienteId: "c1", clienteNombre: "Ana", emitidaAt: dia(5), saldo: 100.25 }),
        factura({ facturaId: "b", clienteId: "c1", clienteNombre: "Ana", emitidaAt: dia(95), saldo: 50 }),
        factura({ facturaId: "c", clienteId: "c2", clienteNombre: "Beto", emitidaAt: dia(40), saldo: 500 }),
        factura({ facturaId: "d", clienteId: "c2", clienteNombre: "Beto", emitidaAt: dia(61), saldo: 20 }),
      ],
      AHORA,
    );
    expect(r.clientes.map((c) => c.clienteId)).toEqual(["c2", "c1"]);
    expect(r.clientes[0].saldoTotal).toBe(520);
    expect(r.clientes[0].facturas.map((f) => f.facturaId)).toEqual(["d", "c"]);
    expect(r.clientes[0].diasMasAntigua).toBe(61);
    expect(r.clientes[1].porRango["90+"]).toBe(50);
    expect(r.clientes[1].saldoTotal).toBe(150.25);
    expect(r.totales).toEqual({ "0-30": 100.25, "31-60": 500, "61-90": 20, "90+": 50, total: 670.25 });
  });
  it("lista vacía", () => {
    const r = agruparCartera([], AHORA);
    expect(r.clientes).toEqual([]);
    expect(r.totales.total).toBe(0);
  });
});
