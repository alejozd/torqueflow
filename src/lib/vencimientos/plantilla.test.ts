import { describe, expect, it } from "vitest";
import { construirMensajeAvisoVencimiento, textoAvisoVencimiento } from "./plantilla";

const AHORA = new Date("2026-10-10T15:00:00Z");
const base = {
  clienteNombre: "Ana <b>Pérez</b>",
  placa: "ABC123",
  tipo: "SOAT" as const,
  fechaVencimiento: new Date("2026-10-30T00:00:00Z"),
  tallerNombre: "Taller Pérez",
  ahora: AHORA,
};

describe("textoAvisoVencimiento", () => {
  it("habla de 'vence el' cuando aún no vence, con la fecha sin correrse de día", () => {
    const texto = textoAvisoVencimiento(base);
    expect(texto).toContain("SOAT");
    expect(texto).toContain("ABC123");
    expect(texto).toMatch(/vence el 30\/10\/2026/);
    expect(texto).toContain("Taller Pérez");
  });

  it("habla de 'venció el' cuando ya venció", () => {
    const texto = textoAvisoVencimiento({ ...base, tipo: "TECNOMECANICA", fechaVencimiento: new Date("2026-10-01T00:00:00Z") });
    expect(texto).toContain("revisión técnico-mecánica");
    expect(texto).toMatch(/venció el 1\/10\/2026/);
  });
});

describe("construirMensajeAvisoVencimiento", () => {
  it("arma asunto y escapa el HTML", () => {
    const mensaje = construirMensajeAvisoVencimiento("ana@cliente.test", base);
    expect(mensaje.para).toBe("ana@cliente.test");
    expect(mensaje.asunto).toBe("Vencimiento de SOAT — ABC123");
    expect(mensaje.html).toContain("Ana &lt;b&gt;Pérez&lt;/b&gt;");
    expect(mensaje.html).not.toContain("<b>Pérez</b>");
  });
});
