import { beforeEach, describe, expect, it, vi } from "vitest";
import { sincronizarCuentaPorPagar } from "./sincronizar-cuenta";

const orden: string[] = [];
const tx = {
  $queryRaw: vi.fn(async (partes: TemplateStringsArray) => {
    orden.push(partes.join("?"));
    return [];
  }),
  entradaMercancia: { findUniqueOrThrow: vi.fn() },
  cuentaPorPagar: { create: vi.fn(), update: vi.fn() },
  pagoProveedor: { aggregate: vi.fn() },
};

function entrada(items: { cantidad: number; precioCompraUnitario: string }[], cuentaPorPagar: { id: string } | null) {
  return { proveedorId: "p1", createdAt: new Date("2026-10-17T13:00:00Z"), items, cuentaPorPagar };
}

beforeEach(() => {
  vi.clearAllMocks();
  orden.length = 0;
  tx.entradaMercancia.findUniqueOrThrow.mockImplementation(async () => {
    orden.push("leer entrada");
    return entrada([{ cantidad: 2, precioCompraUnitario: "1000" }], null);
  });
  tx.pagoProveedor.aggregate.mockResolvedValue({ _sum: { monto: null } });
});

describe("sincronizarCuentaPorPagar", () => {
  it("bloquea la fila de la entrada antes de leerla: dos ítems simultáneos se ponen en fila", async () => {
    await sincronizarCuentaPorPagar(tx as never, "e1", "u1");

    expect(orden[0]).toMatch(/FROM entradas_mercancia WHERE id = \? FOR UPDATE/);
    expect(orden[1]).toBe("leer entrada");
    expect(tx.$queryRaw.mock.calls[0]!.slice(1)).toEqual(["e1"]);
  });

  it("la primera vez crea la deuda con el total de los ítems", async () => {
    await sincronizarCuentaPorPagar(tx as never, "e1", "u1");

    expect(tx.cuentaPorPagar.create).toHaveBeenCalledWith({
      data: {
        entradaId: "e1",
        proveedorId: "p1",
        total: 2000,
        saldoPendiente: 2000,
        estado: "PENDIENTE",
        // @db.Date: el día de Bogotá de la entrada, como medianoche UTC.
        fecha: new Date("2026-10-17T00:00:00.000Z"),
        creadoPorId: "u1",
      },
    });
  });

  it("una entrada registrada a las 8 p. m. de Bogotá queda con la fecha de ese día, no la del siguiente", async () => {
    tx.entradaMercancia.findUniqueOrThrow.mockResolvedValue({
      ...entrada([{ cantidad: 1, precioCompraUnitario: "1000" }], null),
      // 17 de octubre, 8 p. m. en Bogotá = 18 de octubre, 1 a. m. UTC.
      createdAt: new Date("2026-10-18T01:00:00Z"),
    });

    await sincronizarCuentaPorPagar(tx as never, "e1", "u1");

    expect(tx.cuentaPorPagar.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ fecha: new Date("2026-10-17T00:00:00.000Z") }),
    });
  });

  it("con la cuenta creada, bloquea también la cuenta y calcula el saldo como total menos abonos", async () => {
    tx.entradaMercancia.findUniqueOrThrow.mockResolvedValue(
      entrada(
        [
          { cantidad: 2, precioCompraUnitario: "1000" },
          { cantidad: 1, precioCompraUnitario: "500.5" },
        ],
        { id: "c1" },
      ),
    );
    tx.pagoProveedor.aggregate.mockResolvedValue({ _sum: { monto: "700" } });

    await sincronizarCuentaPorPagar(tx as never, "e1", "u1");

    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.$queryRaw.mock.calls[1]![0].join("?")).toMatch(/FROM cuentas_por_pagar WHERE id = \? FOR UPDATE/);
    expect(tx.$queryRaw.mock.calls[1]!.slice(1)).toEqual(["c1"]);
    expect(tx.pagoProveedor.aggregate).toHaveBeenCalledWith({ where: { cuentaId: "c1" }, _sum: { monto: true } });
    expect(tx.cuentaPorPagar.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { total: 2500.5, saldoPendiente: 1800.5, estado: "PENDIENTE" },
    });
  });

  it("no arrastra un total viejo: el saldo nunca suma dos veces un ítem (hallazgo M3)", async () => {
    // Antes el saldo se movía por la diferencia contra el `total` guardado: si ese
    // total había quedado sin un ítem (dos altas a la vez), el siguiente ítem
    // volvía a sumarlo. Ahora el total guardado no interviene.
    tx.entradaMercancia.findUniqueOrThrow.mockResolvedValue(
      entrada(
        [
          { cantidad: 1, precioCompraUnitario: "100" },
          { cantidad: 1, precioCompraUnitario: "200" },
          { cantidad: 1, precioCompraUnitario: "300" },
        ],
        { id: "c1" },
      ),
    );

    await sincronizarCuentaPorPagar(tx as never, "e1", "u1");
    await sincronizarCuentaPorPagar(tx as never, "e1", "u1");

    const esperado = { where: { id: "c1" }, data: { total: 600, saldoPendiente: 600, estado: "PENDIENTE" } };
    expect(tx.cuentaPorPagar.update).toHaveBeenNthCalledWith(1, esperado);
    expect(tx.cuentaPorPagar.update).toHaveBeenNthCalledWith(2, esperado);
  });

  it("si los abonos ya cubren el total, la cuenta queda pagada con saldo cero", async () => {
    tx.entradaMercancia.findUniqueOrThrow.mockResolvedValue(
      entrada([{ cantidad: 1, precioCompraUnitario: "1000" }], { id: "c1" }),
    );
    tx.pagoProveedor.aggregate.mockResolvedValue({ _sum: { monto: "1000" } });

    await sincronizarCuentaPorPagar(tx as never, "e1", "u1");

    expect(tx.cuentaPorPagar.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { total: 1000, saldoPendiente: 0, estado: "PAGADA" },
    });
  });
});
