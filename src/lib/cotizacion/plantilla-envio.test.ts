import { describe, expect, it } from "vitest";
import { construirMensajeCotizacion, type DatosMensajeCotizacion } from "./plantilla-envio";

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const base: DatosMensajeCotizacion = {
  clienteNombre: "Ana Pérez",
  numero: 42,
  placa: "ABC123",
  marca: "Mazda",
  modelo: "3",
  items: [
    { descripcion: "Pastillas de freno", cantidad: 2, precioUnitario: 50000 },
    { descripcion: "Cambio de aceite", cantidad: 1, precioUnitario: 100000 },
  ],
  subtotal: 200000,
  descuento: 0,
  descuentoPct: 0,
  iva: 50000,
  total: 250000,
  validaHasta: new Date("2026-09-15T00:00:00-05:00"),
  tallerNombre: "Taller Pérez",
};

describe("construirMensajeCotizacion", () => {
  it("addresses the message to the given recipient", () => {
    expect(construirMensajeCotizacion("ana@cliente.test", base).para).toBe("ana@cliente.test");
  });

  it("includes the número and placa in the subject", () => {
    expect(construirMensajeCotizacion("ana@cliente.test", base).asunto).toBe("Cotización #42 — ABC123");
  });

  it("mentions the vehicle and the total in both bodies", () => {
    const mensaje = construirMensajeCotizacion("ana@cliente.test", base);

    expect(mensaje.texto).toContain("Mazda 3 (ABC123)");
    expect(mensaje.texto).toContain(formatoMoneda.format(250000));
    expect(mensaje.html).toContain("Mazda 3 (ABC123)");
    expect(mensaje.html).toContain(formatoMoneda.format(250000));
  });

  it("includes the customer name and the taller name in both bodies", () => {
    const mensaje = construirMensajeCotizacion("ana@cliente.test", base);

    expect(mensaje.texto).toContain("Ana Pérez");
    expect(mensaje.texto).toContain("Taller Pérez");
    expect(mensaje.html).toContain("Taller Pérez");
  });

  it("escapes HTML-significant characters in customer data instead of injecting them", () => {
    const mensaje = construirMensajeCotizacion("ana@cliente.test", {
      ...base,
      clienteNombre: '<script>alert("x")</script>',
    });

    expect(mensaje.html).not.toContain("<script>");
    expect(mensaje.html).toContain("&lt;script&gt;");
    expect(mensaje.texto).toContain('<script>alert("x")</script>');
  });

  it("produces a plain-text body with no markup at all", () => {
    const mensaje = construirMensajeCotizacion("ana@cliente.test", base);

    expect(mensaje.texto).not.toContain("<p>");
  });

  it("lists every item in the plain-text body", () => {
    const mensaje = construirMensajeCotizacion("ana@cliente.test", base);

    expect(mensaje.texto).toContain("Pastillas de freno");
    expect(mensaje.texto).toContain("Cambio de aceite");
  });

  it("lists every item, escaped, in the HTML body", () => {
    const mensaje = construirMensajeCotizacion("ana@cliente.test", {
      ...base,
      items: [{ descripcion: '<b>Pastillas</b> & tornillos', cantidad: 1, precioUnitario: 10000 }],
    });

    expect(mensaje.html).not.toContain("<b>Pastillas</b>");
    expect(mensaje.html).toContain("&lt;b&gt;Pastillas&lt;/b&gt; &amp; tornillos");
  });

  it("shows a descuento line only when descuento is greater than zero", () => {
    const sinDescuento = construirMensajeCotizacion("ana@cliente.test", { ...base, descuento: 0 });
    expect(sinDescuento.html).not.toContain("Descuento");
    expect(sinDescuento.texto).not.toContain("Descuento");

    const conDescuento = construirMensajeCotizacion("ana@cliente.test", { ...base, descuento: 15000, descuentoPct: 10 });
    expect(conDescuento.html).toContain("Descuento");
    expect(conDescuento.html).toContain("10%");
    expect(conDescuento.html).toContain(formatoMoneda.format(15000));
    expect(conDescuento.texto).toContain("Descuento");
    expect(conDescuento.texto).toContain("10%");
    expect(conDescuento.texto).toContain(formatoMoneda.format(15000));
  });

  it("renders subtotal and IVA lines in both bodies", () => {
    const mensaje = construirMensajeCotizacion("ana@cliente.test", base);

    expect(mensaje.html).toContain(formatoMoneda.format(base.subtotal));
    expect(mensaje.html).toContain(formatoMoneda.format(base.iva));
    expect(mensaje.texto).toContain(formatoMoneda.format(base.subtotal));
    expect(mensaje.texto).toContain(formatoMoneda.format(base.iva));
  });

  it("renders an <img> logo when logoUrl is provided", () => {
    const mensaje = construirMensajeCotizacion("ana@cliente.test", { ...base, logoUrl: "https://taller.test/logo.png" });

    expect(mensaje.html).toContain("<img src=\"https://taller.test/logo.png\"");
  });

  it("omits any <img> tag when logoUrl is not provided", () => {
    const mensaje = construirMensajeCotizacion("ana@cliente.test", base);

    expect(mensaje.html).not.toContain("<img");
  });
});
