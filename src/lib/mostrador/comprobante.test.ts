import { describe, expect, it } from "vitest";
import {
  agruparPagos,
  construirMensajeComprobante,
  describirMetodos,
  textoComprobanteWhatsapp,
  type ComprobanteVenta,
} from "./comprobante";

const pesos = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

const BASE: ComprobanteVenta = {
  id: "v1",
  tallerNombre: "Taller Pérez",
  sedeNombre: "Sede Norte",
  numero: 1043,
  fecha: new Date("2026-10-16T02:30:00.000Z"), // 15 oct, 9:30 p. m. en Bogotá
  cliente: { nombre: "Ana <b>Gómez</b>", documento: "123", telefono: "3105551234", email: "ana@correo.co" },
  lineas: [{ id: "i1", descripcion: "Filtro <aceite>", cantidad: 2, precioUnitario: 25000 }],
  subtotal: 50000,
  descuento: 5000,
  iva: 8550,
  total: 53550,
  pagos: [
    { metodoPago: "EFECTIVO", monto: 20000 },
    { metodoPago: "TARJETA", monto: 20000 },
    { metodoPago: "EFECTIVO", monto: 3550 },
  ],
  saldoPendiente: 10000,
};

describe("agruparPagos / describirMetodos", () => {
  it("suma por método en el orden en que aparecen", () => {
    expect(agruparPagos(BASE.pagos)).toEqual([
      { metodoPago: "EFECTIVO", monto: 23550 },
      { metodoPago: "TARJETA", monto: 20000 },
    ]);
    expect(describirMetodos(BASE.pagos)).toBe("Efectivo + Tarjeta");
  });

  it("sin pagos es a crédito", () => {
    expect(describirMetodos([])).toBe("A crédito");
  });
});

describe("textoComprobanteWhatsapp", () => {
  it("lleva el número, las líneas, los totales, los pagos, el saldo y el aviso de no factura", () => {
    const texto = textoComprobanteWhatsapp(BASE);
    expect(texto).toContain("gracias por tu compra en Taller Pérez");
    expect(texto).toContain("venta #1043");
    expect(texto).toContain("15/10/2026");
    expect(texto).toContain(`Filtro <aceite> x2: ${pesos(50000)}`);
    expect(texto).toContain(`Descuento: -${pesos(5000)}`);
    expect(texto).toContain(`*Total: ${pesos(53550)}*`);
    expect(texto).toContain(`Efectivo: ${pesos(23550)}`);
    expect(texto).toContain(`Saldo pendiente: ${pesos(10000)}`);
    expect(texto).toContain("Documento no válido como factura electrónica");
  });

  it("sin cliente saluda sin nombre y sin descuento no lo menciona", () => {
    const texto = textoComprobanteWhatsapp({ ...BASE, cliente: null, descuento: 0, saldoPendiente: 0 });
    expect(texto.startsWith("Hola, gracias")).toBe(true);
    expect(texto).not.toContain("Descuento");
    expect(texto).not.toContain("Saldo pendiente");
  });
});

describe("construirMensajeComprobante", () => {
  it("arma asunto, texto y HTML con lo escrito por personas escapado", () => {
    const mensaje = construirMensajeComprobante("ana@correo.co", BASE);
    expect(mensaje.para).toBe("ana@correo.co");
    expect(mensaje.asunto).toBe("Comprobante de tu compra #1043 — Taller Pérez");
    expect(mensaje.texto).toContain("Documento no válido como factura electrónica");
    expect(mensaje.html).toContain("Ana &lt;b&gt;Gómez&lt;/b&gt;");
    expect(mensaje.html).toContain("Filtro &lt;aceite&gt;");
    expect(mensaje.html).not.toContain("<aceite>");
    expect(mensaje.html).toContain("Documento no válido como factura electrónica");
  });
});
