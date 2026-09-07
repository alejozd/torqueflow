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
});
