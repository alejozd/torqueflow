// @vitest-environment node
import { describe, expect, it } from "vitest";
import { crearProveedorSimulado, type MemoriaSimulado } from "./simulado";
import type { FacturaVenta } from "../modelo";

const factura: FacturaVenta = {
  tipo: "FACTURA",
  prefijo: "SETP",
  numero: 990000001,
  resolucionNumero: "18760000001",
  fecha: "2026-11-20",
  hora: "10:00:00",
  adquirente: { tipo: "CONSUMIDOR_FINAL" },
  lineas: [
    { codigo: "A", descripcion: "Aceite", cantidad: 1, unidad: "94", precioUnitario: 5000000, descuento: 0, iva: { tarifa: 19 } },
  ],
  pago: { forma: "CONTADO", medio: "10", vencimiento: "2026-11-20" },
  enviarCorreo: false,
};
const ref = { tipo: "FACTURA" as const, prefijo: "SETP", numero: 990000001 };

describe("proveedor simulado", () => {
  it("por defecto acepta con un CUFE de 96 caracteres hexadecimales, siempre el mismo para el mismo número", async () => {
    const r1 = await crearProveedorSimulado().enviar(factura);
    const r2 = await crearProveedorSimulado().enviar(factura);
    expect(r1.estado).toBe("ACEPTADO");
    if (r1.estado !== "ACEPTADO" || r2.estado !== "ACEPTADO") return;
    expect(r1.cufe).toMatch(/^[0-9a-f]{96}$/);
    expect(r1.cufe).toBe(r2.cufe);
    expect(r1.fechaValidacion).toBe("2026-11-20T10:00:00-05:00");
  });

  it("reenviar el mismo número en la misma instancia devuelve la Regla 90", async () => {
    const p = crearProveedorSimulado();
    await p.enviar(factura);
    const r = await p.enviar(factura);
    expect(r.estado).toBe("RECHAZADO");
    if (r.estado === "RECHAZADO") expect(r.motivos[0].codigo).toBe("90");
  });

  it("consulta: encuentra lo aceptado y responde NO_ENCONTRADO para lo demás", async () => {
    const p = crearProveedorSimulado();
    expect(await p.consultarEstado(ref)).toEqual({ estado: "NO_ENCONTRADO" });
    await p.enviar(factura);
    expect((await p.consultarEstado(ref)).estado).toBe("ACEPTADO");
  });

  it("se puede forzar rechazo o caída", async () => {
    const rechazo = await crearProveedorSimulado({ resultado: "RECHAZAR" }).enviar(factura);
    expect(rechazo.estado).toBe("RECHAZADO");
    if (rechazo.estado === "RECHAZADO") expect(rechazo.motivos[0].codigo).toBe("FAU14");

    const caida = crearProveedorSimulado({ resultado: "CAIDA" });
    expect((await caida.enviar(factura)).estado).toBe("ERROR_TEMPORAL");
    expect((await caida.probarConexion()).ok).toBe(false);
  });

  it("descarga un PDF y un XML marcados como simulados", async () => {
    const p = crearProveedorSimulado();
    const pdf = new TextDecoder().decode(await p.descargar(ref, "PDF"));
    const xml = new TextDecoder().decode(await p.descargar(ref, "XML"));
    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect(pdf).toMatch(/sin validez fiscal/);
    expect(xml).toMatch(/SETP990000001/);
  });

  it("la prueba de conexión responde bien", async () => {
    expect(await crearProveedorSimulado().probarConexion()).toEqual({ ok: true, ambiente: null });
  });

  it("CAIDA_RECIBIDO: responde error temporal pero la DIAN sí lo tiene (consulta e histórico)", async () => {
    const p = crearProveedorSimulado({ resultado: "CAIDA_RECIBIDO" });
    expect((await p.enviar(factura)).estado).toBe("ERROR_TEMPORAL");
    expect((await p.consultarEstado(ref)).estado).toBe("ACEPTADO");
    expect(await p.buscarEmitido(ref, "2026-11-20")).toEqual({
      estado: "ENCONTRADO",
      cufe: expect.stringMatching(/^[0-9a-f]{96}$/),
      total: 5950000,
    });
  });

  it("buscarEmitido: NO_ENCONTRADO hasta que se envía; la memoria se puede compartir", async () => {
    const memoria: MemoriaSimulado = new Map();
    const a = crearProveedorSimulado({ memoria });
    const b = crearProveedorSimulado({ memoria });
    expect(await b.buscarEmitido(ref, "2026-11-20")).toEqual({ estado: "NO_ENCONTRADO" });
    await a.enviar(factura);
    expect((await b.buscarEmitido(ref, "2026-11-20")).estado).toBe("ENCONTRADO");
    // Regla 90: la otra instancia ve que ya estaba.
    expect((await b.enviar(factura)).estado).toBe("RECHAZADO");
  });

  it("CAIDA: el histórico tampoco responde", async () => {
    const r = await crearProveedorSimulado({ resultado: "CAIDA" }).buscarEmitido(ref, "2026-11-20");
    expect(r.estado).toBe("ERROR_TEMPORAL");
  });
});
