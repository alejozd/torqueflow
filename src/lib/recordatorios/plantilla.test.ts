import { describe, expect, it } from "vitest";
import { construirMensajeRecordatorio, type DatosRecordatorio } from "./plantilla";

const base: DatosRecordatorio = {
  clienteNombre: "Ana Pérez",
  placa: "ABC123",
  marca: "Mazda",
  modelo: "3",
  motivo: "KILOMETRAJE",
  tallerNombre: "Taller Pérez",
};

describe("construirMensajeRecordatorio", () => {
  it("addresses the message to the given recipient", () => {
    expect(construirMensajeRecordatorio("ana@cliente.test", base).para).toBe("ana@cliente.test");
  });

  it("names the vehicle in the subject so the customer knows which car it is about", () => {
    expect(construirMensajeRecordatorio("ana@cliente.test", base).asunto).toBe(
      "Recordatorio de mantenimiento — ABC123",
    );
  });

  it("explains the kilometraje reason in both bodies", () => {
    const mensaje = construirMensajeRecordatorio("ana@cliente.test", base);

    expect(mensaje.texto).toContain("Ana Pérez");
    expect(mensaje.texto).toContain("Mazda 3 (ABC123)");
    expect(mensaje.texto).toContain("5.000 km");
    expect(mensaje.html).toContain("5.000 km");
    expect(mensaje.texto).toContain("Taller Pérez");
  });

  it("explains the tiempo reason instead when that threshold fired", () => {
    const mensaje = construirMensajeRecordatorio("ana@cliente.test", { ...base, motivo: "TIEMPO" });

    expect(mensaje.texto).toContain("6 meses");
    expect(mensaje.texto).not.toContain("5.000 km");
  });

  it("escapes HTML-significant characters in customer data instead of injecting them", () => {
    const mensaje = construirMensajeRecordatorio("ana@cliente.test", {
      ...base,
      clienteNombre: '<script>alert("x")</script>',
    });

    expect(mensaje.html).not.toContain("<script>");
    expect(mensaje.html).toContain("&lt;script&gt;");
  });

  it("produces a plain-text body with no markup at all", () => {
    const mensaje = construirMensajeRecordatorio("ana@cliente.test", base);

    expect(mensaje.texto).not.toContain("<");
  });
});
