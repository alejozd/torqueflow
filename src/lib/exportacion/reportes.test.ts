import { describe, expect, it } from "vitest";
import { hojaArqueos, hojaCartera, hojaCuentasPorPagar, hojaVentasDelDia } from "./reportes";
import { escribirLibro, leerLibro } from "@/lib/importacion/xlsx";
import type { CarteraVista } from "@/app/actions/cartera-actions";

const CARTERA: CarteraVista = {
  sedeId: "s1",
  clientes: [
    {
      clienteId: "c1",
      clienteNombre: "Ana Pérez",
      clienteTelefono: "3001234567",
      urlWhatsapp: "https://wa.me/573001234567",
      saldoTotal: 150000,
      porRango: { "0-30": 100000, "31-60": 50000, "61-90": 0, "90+": 0 },
      diasMasAntigua: 45,
      facturas: [
        {
          facturaId: "f1",
          numero: 7,
          clienteId: "c1",
          clienteNombre: "Ana Pérez",
          clienteTelefono: "3001234567",
          emitidaAt: new Date("2026-09-02T15:00:00Z"),
          total: 100000,
          saldo: 100000,
          dias: 45,
          rango: "31-60",
        },
      ],
    },
  ],
  totales: { "0-30": 0, "31-60": 100000, "61-90": 0, "90+": 0, total: 100000 },
};

describe("reportes de exportación", () => {
  it("la cartera lleva una fila por factura más el total", () => {
    const hoja = hojaCartera(CARTERA);

    expect(hoja.nombre).toBe("Cartera");
    expect(hoja.filas[0]).toEqual(["Cliente", "Factura", "Emitida", "Días", "Antigüedad", "Total", "Saldo"]);
    expect(hoja.filas[1]).toEqual(["Ana Pérez", 7, expect.any(String), 45, "31 a 60 días", 100000, 100000]);
    expect(hoja.filas).toContainEqual(["Total por cobrar", null, null, null, null, null, 100000]);
  });

  it("las cuentas por pagar suman lo que se debe", () => {
    const hoja = hojaCuentasPorPagar(
      [
        {
          proveedorId: "p1",
          proveedorNombre: "Repuestos del Norte",
          saldoTotal: 170000,
          porRango: { "0-30": 170000, "31-60": 0, "61-90": 0, "90+": 0 },
          diasMasAntigua: 3,
          cuentas: [
            {
              cuentaId: "c1",
              proveedorId: "p1",
              proveedorNombre: "Repuestos del Norte",
              entradaId: "e1",
              fecha: new Date("2026-10-14T13:00:00Z"),
              total: 200000,
              saldo: 170000,
              dias: 3,
              rango: "0-30",
            },
          ],
        },
      ],
      { "0-30": 170000, "31-60": 0, "61-90": 0, "90+": 0, total: 170000 },
    );

    expect(hoja.filas[1]).toEqual(["Repuestos del Norte", expect.any(String), 3, "0 a 30 días", 200000, 170000]);
    expect(hoja.filas).toContainEqual(["Total por pagar", null, null, null, null, 170000]);
  });

  it("las ventas del día resumen los productos y suman", () => {
    const hoja = hojaVentasDelDia([
      {
        numero: 3,
        createdAt: new Date("2026-10-17T15:30:00Z"),
        clienteNombre: null,
        total: 59500,
        saldoPendiente: 0,
        estado: "PAGADA",
        items: [
          { cantidad: 2, descripcion: "Filtro de aceite" },
          { cantidad: 1, descripcion: "Bujía" },
        ],
      },
    ]);

    expect(hoja.filas[1]).toEqual([
      3,
      expect.any(String),
      "Consumidor final",
      "2 × Filtro de aceite; 1 × Bujía",
      59500,
      0,
      "Pagada",
    ]);
    expect(hoja.filas).toContainEqual(["Total del día", null, null, null, 59500, 0, null]);
  });

  it("los arqueos traducen el resultado del cierre", () => {
    const hoja = hojaArqueos([
      {
        abiertaAt: new Date("2026-10-17T13:00:00Z"),
        cerradaAt: new Date("2026-10-17T21:00:00Z"),
        abrioPorNombre: "Ana",
        cerroPorNombre: "Luis",
        baseInicial: 100000,
        esperado: 250000,
        contado: 240000,
        diferencia: -10000,
        tipo: "FALTANTE",
        notas: null,
      },
    ]);

    const fila = hoja.filas[1]!;
    expect(fila[2]).toBe("Ana");
    expect(fila[8]).toBe("Faltante");
    expect(fila[9]).toBe("");
  });

  it("un texto que empieza por '=' queda como texto y no como fórmula", async () => {
    const hoja = hojaVentasDelDia([
      {
        numero: 1,
        createdAt: new Date("2026-10-17T15:30:00Z"),
        clienteNombre: "=SUMA(A1:A9)",
        total: 1000,
        saldoPendiente: 0,
        estado: "PAGADA",
        items: [{ cantidad: 1, descripcion: "+peligro" }],
      },
    ]);

    const archivo = await escribirLibro([hoja]);
    const [leida] = await leerLibro(archivo);

    expect(leida!.filas[1]![2]).toBe("=SUMA(A1:A9)");
    expect(leida!.filas[1]![3]).toBe("1 × +peligro");
  });
});
