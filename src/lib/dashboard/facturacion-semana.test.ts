import { describe, expect, it } from "vitest";
import { pesosCompactos, resumirFacturacion } from "./facturacion-semana";

/** 14 días de Bogotá: los 7 anteriores y los 7 de la semana (del 8 al 14 de octubre). */
const DIAS = Array.from({ length: 14 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);

/** Una factura a las `hora` de Bogotá del día `dia`. */
function factura(dia: string, total: number, saldoPendiente = 0, hora = "10:00") {
  return { createdAt: new Date(`${dia}T${hora}:00-05:00`), total, saldoPendiente };
}

describe("pesosCompactos", () => {
  it("abrevia como se dice en Colombia", () => {
    expect(pesosCompactos(4_125_000)).toBe("$4,1 M");
    expect(pesosCompactos(2_000_000)).toBe("$2 M");
    expect(pesosCompactos(590_400)).toBe("$590 mil");
    expect(pesosCompactos(950)).toBe("$950");
    expect(pesosCompactos(0)).toBe("$0");
  });
});

describe("resumirFacturacion", () => {
  it("separa cobrado y pendiente por día de Bogotá, con la semana en los últimos 7 días", () => {
    const r = resumirFacturacion(
      [
        factura("2026-10-13", 1_000_000, 400_000),
        // 13 de octubre, 8 p. m. en Bogotá: cuenta el 13 aunque en UTC ya sea el 14.
        factura("2026-10-13", 200_000, 0, "20:00"),
        factura("2026-10-14", 300_000, 300_000),
        factura("2026-10-02", 500_000), // semana anterior
      ],
      DIAS,
    );

    expect(r.dias.map((dia) => dia.fecha)).toEqual(DIAS.slice(7));
    expect(r.dias.find((dia) => dia.fecha === "2026-10-13")).toEqual({
      fecha: "2026-10-13",
      total: 1_200_000,
      cobrado: 800_000,
      pendiente: 400_000,
      facturas: 2,
    });
    expect(r).toMatchObject({
      total: 1_500_000,
      cobrado: 800_000,
      pendiente: 700_000,
      facturas: 3,
      facturasPendientes: 2,
      totalSemanaAnterior: 500_000,
      variacion: 200,
      promedioDiario: 1_500_000 / 7,
      diasSinFacturar: 5,
    });
    expect(r.mejorDia?.fecha).toBe("2026-10-13");
  });

  it("explica la semana en frases cortas: comparación, mejor día y cobro", () => {
    const r = resumirFacturacion(
      [factura("2026-10-13", 1_000_000, 400_000), factura("2026-10-14", 300_000), factura("2026-10-02", 1_000_000)],
      DIAS,
    );

    expect(r.lecturas).toEqual([
      "Esta semana se facturaron $1,3 M en 2 facturas, 30 % más que los 7 días anteriores ($1 M).",
      "El mejor día fue el martes 13, con $1 M. Hubo 5 días sin facturar.",
      "Ya se cobró el 69 % de lo facturado; quedan $400 mil por cobrar en 1 factura.",
    ]);
  });

  it("dice cuando la semana va por debajo y cuando todo está cobrado", () => {
    const r = resumirFacturacion([factura("2026-10-14", 500_000), factura("2026-10-03", 1_000_000)], DIAS);

    expect(r.variacion).toBe(-50);
    expect(r.lecturas[0]).toBe(
      "Esta semana se facturaron $500 mil en 1 factura, 50 % menos que los 7 días anteriores ($1 M).",
    );
    expect(r.lecturas[2]).toBe("Todo lo facturado esta semana ya está cobrado.");
  });

  it("sin semana anterior no inventa un porcentaje", () => {
    const r = resumirFacturacion([factura("2026-10-14", 500_000)], DIAS);

    expect(r.variacion).toBeNull();
    expect(r.lecturas[0]).toBe(
      "Esta semana se facturaron $500 mil en 1 factura. No hubo facturas en los 7 días anteriores para comparar.",
    );
  });

  it("una semana sin facturas lo dice sin más lecturas", () => {
    const r = resumirFacturacion([factura("2026-10-03", 1_000_000)], DIAS);

    expect(r.total).toBe(0);
    expect(r.mejorDia).toBeNull();
    expect(r.lecturas).toEqual(["No hubo facturas en los últimos 7 días (la semana anterior se facturaron $1 M)."]);
  });
});
