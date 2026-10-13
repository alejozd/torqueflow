import { describe, expect, it } from "vitest";
import { agruparCuentasPorPagar, type CuentaPorPagarFila } from "./cuentas-por-pagar";

const AHORA = new Date("2026-10-17T15:00:00.000Z");
const haceDias = (dias: number) => new Date(AHORA.getTime() - dias * 24 * 60 * 60 * 1000);

function cuenta(cambios: Partial<CuentaPorPagarFila> = {}): CuentaPorPagarFila {
  return {
    cuentaId: "c1",
    proveedorId: "p1",
    proveedorNombre: "Repuestos del Norte",
    entradaId: "e1",
    fecha: haceDias(10),
    total: 100000,
    saldo: 100000,
    ...cambios,
  };
}

describe("agruparCuentasPorPagar", () => {
  it("agrupa por proveedor, suma saldos y reparte por antigüedad", () => {
    const { proveedores, totales } = agruparCuentasPorPagar(
      [
        cuenta({ cuentaId: "c1", saldo: 100000, fecha: haceDias(10) }),
        cuenta({ cuentaId: "c2", saldo: 50000, fecha: haceDias(45) }),
        cuenta({ cuentaId: "c3", proveedorId: "p2", proveedorNombre: "Otro", saldo: 20000, fecha: haceDias(120) }),
      ],
      AHORA,
    );

    expect(proveedores).toHaveLength(2);
    // El proveedor con más deuda va primero.
    expect(proveedores[0]!.proveedorId).toBe("p1");
    expect(proveedores[0]!.saldoTotal).toBe(150000);
    expect(proveedores[0]!.porRango).toEqual({ "0-30": 100000, "31-60": 50000, "61-90": 0, "90+": 0 });
    expect(proveedores[0]!.diasMasAntigua).toBe(45);
    expect(proveedores[0]!.cuentas.map((c) => c.cuentaId)).toEqual(["c2", "c1"]); // la más antigua primero
    expect(proveedores[1]!.porRango["90+"]).toBe(20000);
    expect(totales.total).toBe(170000);
    expect(totales["90+"]).toBe(20000);
  });

  it("sin cuentas devuelve todo en cero", () => {
    const { proveedores, totales } = agruparCuentasPorPagar([], AHORA);

    expect(proveedores).toEqual([]);
    expect(totales).toEqual({ "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0, total: 0 });
  });

  it("una cuenta saldada no suma saldo pero sigue apareciendo en su proveedor", () => {
    const { proveedores, totales } = agruparCuentasPorPagar([cuenta({ saldo: 0 })], AHORA);

    expect(proveedores[0]!.saldoTotal).toBe(0);
    expect(proveedores[0]!.cuentas).toHaveLength(1);
    expect(totales.total).toBe(0);
  });
});
