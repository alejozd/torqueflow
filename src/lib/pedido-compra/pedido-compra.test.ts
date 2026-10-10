import { describe, expect, it } from "vitest";
import {
  accionesPermitidas,
  agruparLineasPedido,
  calcularFechaEsperada,
  construirMensajePedido,
  textoPedidoWhatsapp,
  type DatosMensajePedido,
} from "./pedido-compra";

const linea = (repuestoId: string, proveedorId: string | null, bodegaId = "b1") => ({
  repuestoId,
  proveedorId,
  bodegaId,
  cantidad: 2,
  precioCompra: 1000,
});

describe("agruparLineasPedido", () => {
  it("creates one group per proveedor and bodega, and sets aside lines without proveedor", () => {
    const { grupos, sinProveedor } = agruparLineasPedido([
      linea("r1", "p1"),
      linea("r2", "p1"),
      linea("r3", "p1", "b2"),
      linea("r4", "p2"),
      linea("r5", null),
    ]);

    expect(grupos.map((grupo) => [grupo.proveedorId, grupo.bodegaId, grupo.lineas.map((l) => l.repuestoId)])).toEqual([
      ["p1", "b1", ["r1", "r2"]],
      ["p1", "b2", ["r3"]],
      ["p2", "b1", ["r4"]],
    ]);
    expect(sinProveedor.map((l) => l.repuestoId)).toEqual(["r5"]);
  });
});

describe("accionesPermitidas", () => {
  it("allows sending drafts and resending sent pedidos, receiving only sent ones", () => {
    expect(accionesPermitidas("BORRADOR")).toEqual({ enviar: true, recibir: false, cancelar: true });
    expect(accionesPermitidas("ENVIADO")).toEqual({ enviar: true, recibir: true, cancelar: true });
    expect(accionesPermitidas("RECIBIDO")).toEqual({ enviar: false, recibir: false, cancelar: false });
    expect(accionesPermitidas("CANCELADO")).toEqual({ enviar: false, recibir: false, cancelar: false });
  });
});

describe("calcularFechaEsperada", () => {
  it("adds the proveedor's lead time to the send date", () => {
    expect(calcularFechaEsperada(new Date("2026-10-09T15:00:00.000Z"), 3)).toEqual(new Date("2026-10-12T15:00:00.000Z"));
  });
});

const datos: DatosMensajePedido = {
  numero: 7,
  tallerNombre: "Taller Pérez",
  proveedorNombre: "Bosch <Colombia>",
  bodegaNombre: "Bodega principal",
  items: [
    { codigo: "FLT-001", nombre: "Filtro de aceite", cantidad: 12 },
    { codigo: "BJ-4", nombre: "Bujía", cantidad: 8 },
  ],
};

describe("textoPedidoWhatsapp", () => {
  it("lists every item with its quantity and code", () => {
    const texto = textoPedidoWhatsapp(datos);
    expect(texto).toContain("Queremos hacer el pedido *#7*:");
    expect(texto).toContain("- 12 x Filtro de aceite (FLT-001)");
    expect(texto).toContain("- 8 x Bujía (BJ-4)");
    expect(texto).toContain("Entrega en: Bodega principal.");
  });
});

describe("construirMensajePedido", () => {
  it("builds subject, text and escaped HTML for the proveedor", () => {
    const mensaje = construirMensajePedido("pedidos@bosch.test", datos);

    expect(mensaje.para).toBe("pedidos@bosch.test");
    expect(mensaje.asunto).toBe("Pedido de compra #7 — Taller Pérez");
    expect(mensaje.texto).toContain("- 12 x Filtro de aceite (FLT-001)");
    expect(mensaje.html).toContain("Hola Bosch &lt;Colombia&gt;,");
    expect(mensaje.html).not.toContain("<Colombia>");
  });
});
