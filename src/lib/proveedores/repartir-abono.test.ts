import { describe, expect, it } from "vitest";
import { repartirAbono } from "./repartir-abono";

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// Las tres entradas de Distribuidora Gates del mockup, desordenadas a propósito.
const GATES = [
  { cuentaId: "g2", fecha: dia("2026-09-27"), saldo: 4029365 },
  { cuentaId: "g1", fecha: dia("2026-08-07"), saldo: 3948632 },
  { cuentaId: "g3", fecha: dia("2026-10-06"), saldo: 1815989 },
];

describe("repartirAbono", () => {
  it("empieza por la entrada más vieja y pasa lo que sobra a la siguiente", () => {
    expect(repartirAbono(GATES, 5000000)).toEqual([
      { cuentaId: "g1", recibe: 3948632, queda: 0 },
      { cuentaId: "g2", recibe: 1051368, queda: 2977997 },
      { cuentaId: "g3", recibe: 0, queda: 1815989 },
    ]);
  });

  it("un pago menor que la entrada más vieja solo la toca a ella", () => {
    expect(repartirAbono(GATES, 100000).filter((p) => p.recibe > 0)).toEqual([
      { cuentaId: "g1", recibe: 100000, queda: 3848632 },
    ]);
  });

  it("todo lo que se debe salda todas las entradas", () => {
    const reparto = repartirAbono(GATES, 9793986);
    expect(reparto.every((p) => p.queda === 0)).toBe(true);
    expect(reparto.reduce((suma, p) => suma + p.recibe, 0)).toBe(9793986);
  });

  it("nunca reparte más de lo que se debe, ni montos negativos", () => {
    expect(repartirAbono(GATES, 20000000).reduce((suma, p) => suma + p.recibe, 0)).toBe(9793986);
    expect(repartirAbono(GATES, -5).every((p) => p.recibe === 0)).toBe(true);
  });

  it("el mismo día desempata por id para que el diálogo y el servidor repartan igual", () => {
    const mismoDia = [
      { cuentaId: "b", fecha: dia("2026-10-01"), saldo: 100 },
      { cuentaId: "a", fecha: dia("2026-10-01"), saldo: 100 },
    ];
    expect(repartirAbono(mismoDia, 150)).toEqual([
      { cuentaId: "a", recibe: 100, queda: 0 },
      { cuentaId: "b", recibe: 50, queda: 50 },
    ]);
  });

  it("con centavos redondea a dos decimales", () => {
    expect(repartirAbono([{ cuentaId: "c", fecha: dia("2026-10-01"), saldo: 100.1 }], 0.3)).toEqual([
      { cuentaId: "c", recibe: 0.3, queda: 99.8 },
    ]);
  });
});
