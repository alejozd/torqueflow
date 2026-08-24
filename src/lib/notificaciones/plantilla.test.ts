import { describe, expect, it } from "vitest";
import {
  construirMensajeEstadoOrden,
  esEstadoNotificable,
  type DatosMensajeEstadoOrden,
} from "./plantilla";

const base: DatosMensajeEstadoOrden = {
  clienteNombre: "Ana Pérez",
  placa: "ABC123",
  marca: "Mazda",
  modelo: "3",
  estado: "EN_PROCESO",
  tallerNombre: "Taller Pérez",
};

describe("esEstadoNotificable", () => {
  it("accepts EN_PROCESO, TERMINADA and ANULADA", () => {
    expect(esEstadoNotificable("EN_PROCESO")).toBe(true);
    expect(esEstadoNotificable("TERMINADA")).toBe(true);
    expect(esEstadoNotificable("ANULADA")).toBe(true);
  });

  it("rejects BORRADOR and ENTREGADA", () => {
    expect(esEstadoNotificable("BORRADOR")).toBe(false);
    expect(esEstadoNotificable("ENTREGADA")).toBe(false);
  });
});

describe("construirMensajeEstadoOrden", () => {
  it("addresses the message to the given recipient", () => {
    expect(construirMensajeEstadoOrden("ana@cliente.test", base).para).toBe("ana@cliente.test");
  });

  it("names the vehicle and the estado in the subject", () => {
    expect(construirMensajeEstadoOrden("ana@cliente.test", base).asunto).toBe(
      "Tu vehículo está en reparación — ABC123",
    );
  });

  it("uses a distinct subject and body per notifiable estado", () => {
    const terminada = construirMensajeEstadoOrden("ana@cliente.test", { ...base, estado: "TERMINADA" });
    const anulada = construirMensajeEstadoOrden("ana@cliente.test", { ...base, estado: "ANULADA" });

    expect(terminada.asunto).toBe("Tu vehículo está listo para recoger — ABC123");
    expect(terminada.texto).toContain("listo para que lo recojas");
    expect(anulada.asunto).toBe("Tu orden de trabajo fue anulada — ABC123");
    expect(anulada.texto).toContain("anulada");
  });

  it("includes the customer name, the vehicle and the taller name in both bodies", () => {
    const mensaje = construirMensajeEstadoOrden("ana@cliente.test", base);

    expect(mensaje.texto).toContain("Ana Pérez");
    expect(mensaje.texto).toContain("Mazda 3 (ABC123)");
    expect(mensaje.texto).toContain("Taller Pérez");
    expect(mensaje.html).toContain("Mazda 3 (ABC123)");
  });

  it("escapes HTML-significant characters in customer data instead of injecting them", () => {
    const mensaje = construirMensajeEstadoOrden("ana@cliente.test", {
      ...base,
      clienteNombre: '<script>alert("x")</script>',
    });

    expect(mensaje.html).not.toContain("<script>");
    expect(mensaje.html).toContain("&lt;script&gt;");
  });

  it("produces a plain-text body with no markup at all", () => {
    const mensaje = construirMensajeEstadoOrden("ana@cliente.test", base);

    expect(mensaje.texto).not.toContain("<");
  });
});
