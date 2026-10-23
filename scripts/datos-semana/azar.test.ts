import { describe, expect, it } from "vitest";
import { cedula, celular, correo, crearAzar, nombrePersona, placa } from "./azar";

describe("azar", () => {
  it("es repetible con la misma semilla", () => {
    const a = crearAzar(42), b = crearAzar(42);
    expect([a.entero(1, 1000), a.entero(1, 1000), a.azar()]).toEqual([b.entero(1, 1000), b.entero(1, 1000), b.azar()]);
  });
  it("entero respeta los límites", () => {
    const az = crearAzar(1);
    for (let i = 0; i < 500; i++) {
      const n = az.entero(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });
  it("datos colombianos con formato válido y correo de prueba", () => {
    const az = crearAzar(9);
    const { nombres, apellidos } = nombrePersona(az);
    expect(nombres.length).toBeGreaterThan(0);
    expect(apellidos.length).toBeGreaterThan(0);
    expect(cedula(az)).toMatch(/^\d{8,10}$/);
    expect(celular(az)).toMatch(/^3\d{2} \d{3} \d{4}$/);
    expect(correo("José Ángel", "Núñez Ríos", az)).toMatch(/^[a-z0-9.]+@ejemplo\.test$/);
  });
  it("placa con formato colombiano y nunca repetida", () => {
    const az = crearAzar(3);
    const ocupadas = new Set(["JKT482", "MRW615"]);
    for (let i = 0; i < 200; i++) {
      const p = placa(az, ocupadas);
      expect(p).toMatch(/^[A-Z]{3}\d{3}$/);
      expect(ocupadas.has(p)).toBe(false);
      ocupadas.add(p);
    }
  });
});
