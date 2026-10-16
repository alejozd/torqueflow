import { describe, expect, it } from "vitest";
import { agruparCuentasPorPagar, lecturaUrgente, resumirEntrada, type CuentaPorPagarFila } from "./cuentas-por-pagar";

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
    pagado: 0,
    entrada: { id: "e1", referencias: 1, resumen: "Filtro ×2" },
    pagos: [],
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

describe("resumirEntrada", () => {
  const item = (repuestoId: string, nombre: string, cantidad: number) => ({ repuestoId, nombre, cantidad });

  it("nombra los dos repuestos de mayor cantidad y cuenta el resto", () => {
    expect(
      resumirEntrada([
        item("r1", "Aceite de motor 5W-30", 6),
        item("r2", "Batería NGK", 20),
        item("r3", "Refrigerante", 2),
      ]),
    ).toEqual({ referencias: 3, resumen: "Batería NGK ×20, Aceite de motor 5W-30 ×6 y 1 más" });
  });

  it("junta las líneas del mismo repuesto antes de ordenar", () => {
    expect(resumirEntrada([item("r1", "Filtro", 4), item("r2", "Correa", 6), item("r1", "Filtro", 4)])).toEqual({
      referencias: 2,
      resumen: "Filtro ×8, Correa ×6",
    });
  });

  it("una sola referencia o ninguna", () => {
    expect(resumirEntrada([item("r1", "Refrigerante NGK", 6)])).toEqual({
      referencias: 1,
      resumen: "Refrigerante NGK ×6",
    });
    expect(resumirEntrada([])).toEqual({ referencias: 0, resumen: "Sin ítems" });
  });
});

describe("agruparCuentasPorPagar con los datos de la fila", () => {
  it("conserva lo pagado, el resumen de la entrada y los abonos", () => {
    const pagos = [
      {
        id: "pg1",
        monto: 200000,
        metodoPago: "TRANSFERENCIA",
        referencia: null,
        registradoPor: "Admin Dev",
        createdAt: AHORA,
      },
    ];
    const { proveedores } = agruparCuentasPorPagar(
      [cuenta({ total: 500000, saldo: 300000, pagado: 200000, pagos })],
      AHORA,
    );

    const fila = proveedores[0]!.cuentas[0]!;
    expect(fila.pagado).toBe(200000);
    expect(fila.entrada).toEqual({ id: "e1", referencias: 1, resumen: "Filtro ×2" });
    expect(fila.pagos).toEqual(pagos);
  });
});

describe("lecturaUrgente", () => {
  it("cuenta las entradas con saldo de más de 60 días y nombra a sus proveedores, la más vieja primero", () => {
    const { proveedores } = agruparCuentasPorPagar(
      [
        cuenta({ cuentaId: "g1", proveedorId: "g", proveedorNombre: "Gates", saldo: 300, fecha: haceDias(70) }),
        cuenta({ cuentaId: "g2", proveedorId: "g", proveedorNombre: "Gates", saldo: 100, fecha: haceDias(10) }),
        cuenta({ cuentaId: "t1", proveedorId: "t", proveedorNombre: "Terpel", saldo: 200, fecha: haceDias(73) }),
        cuenta({ cuentaId: "t2", proveedorId: "t", proveedorNombre: "Terpel", saldo: 50, fecha: haceDias(61) }),
        // Saldada hace un momento (sigue en la lista con «✓ Pagada»): no es urgente.
        cuenta({ cuentaId: "b1", proveedorId: "b", proveedorNombre: "Bosch", saldo: 0, fecha: haceDias(90) }),
        // Justo 60 días todavía no pasa del límite.
        cuenta({ cuentaId: "a1", proveedorId: "a", proveedorNombre: "Andina", saldo: 80, fecha: haceDias(60) }),
      ],
      AHORA,
    );

    expect(lecturaUrgente(proveedores)).toEqual({
      entradas: 3,
      suma: 550,
      proveedores: [
        { nombre: "Terpel", dias: 73 },
        { nombre: "Gates", dias: 70 },
      ],
    });
  });

  it("sin nada viejo no hay urgencias", () => {
    expect(lecturaUrgente([])).toEqual({ entradas: 0, suma: 0, proveedores: [] });
  });
});
