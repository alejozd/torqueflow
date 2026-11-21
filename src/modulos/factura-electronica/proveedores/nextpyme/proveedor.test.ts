// src/modulos/factura-electronica/proveedores/nextpyme/proveedor.test.ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { crearProveedorNextpyme } from "./proveedor";
import aceptada from "./__fixtures__/factura-aceptada.json";
import emitidos from "./__fixtures__/emitidos.json";
import type { FacturaVenta } from "../../modelo";

const factura: FacturaVenta = {
  tipo: "FACTURA",
  prefijo: "SETP",
  numero: 990095240,
  resolucionNumero: "18760000001",
  fecha: "2026-11-20",
  hora: "10:00:00",
  adquirente: { tipo: "CONSUMIDOR_FINAL" },
  lineas: [{ codigo: "A", descripcion: "Aceite", cantidad: 1, unidad: "94", precioUnitario: 5000000, descuento: 0, iva: { tarifa: 19 } }],
  pago: { forma: "CONTADO", medio: "10", vencimiento: "2026-11-20" },
  enviarCorreo: false,
};

const respuesta = (status: number, cuerpo: unknown) =>
  new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

function crear(fetchFalso: typeof fetch) {
  return crearProveedorNextpyme({ token: "tok-123", nitEmisor: "901000123", fetch: fetchFalso, timeoutMs: 1000 });
}

describe("crearProveedorNextpyme", () => {
  it("envía la factura con el token y devuelve ACEPTADO", async () => {
    const f = vi.fn(async () => respuesta(200, aceptada));
    const r = await crear(f as unknown as typeof fetch).enviar(factura);
    expect(r.estado).toBe("ACEPTADO");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.nextpyme.plus/api/ubl2.1/invoice");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok-123");
    expect(JSON.parse(String(init.body)).number).toBe(990095240);
  });

  it("la nota crédito va a /credit-note", async () => {
    const f = vi.fn(async () => respuesta(200, aceptada));
    const { tipo: _t, resolucionNumero: _r, ...resto } = factura;
    await crear(f as unknown as typeof fetch).enviar({
      ...resto,
      tipo: "NOTA_CREDITO",
      prefijo: "NC",
      numero: 1,
      concepto: "2",
      motivo: "Anulación",
      facturaReferencia: { numeroCompleto: "SETP990095240", cufe: "abc", fecha: "2026-11-20" },
    });
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("https://api.nextpyme.plus/api/ubl2.1/credit-note");
  });

  it("un fallo de red o tiempo agotado es ERROR_TEMPORAL", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect((await crear(f as unknown as typeof fetch).enviar(factura)).estado).toBe("ERROR_TEMPORAL");
  });

  it("un catálogo desconocido no llama al proveedor y queda como rechazo", async () => {
    const f = vi.fn(async () => respuesta(200, aceptada));
    const r = await crear(f as unknown as typeof fetch).enviar({
      ...factura,
      lineas: [{ ...factura.lineas[0], unidad: "NO-EXISTE" }],
    });
    expect(r.estado).toBe("RECHAZADO");
    expect(f).not.toHaveBeenCalled();
  });

  it("consultarEstado sin CUFE responde NO_ENCONTRADO sin llamar", async () => {
    const f = vi.fn();
    expect(await crear(f as unknown as typeof fetch).consultarEstado({ tipo: "FACTURA", prefijo: "SETP", numero: 1 })).toEqual({
      estado: "NO_ENCONTRADO",
    });
    expect(f).not.toHaveBeenCalled();
  });

  it("consultarEstado con CUFE usa POST /status/document/{cufe}", async () => {
    const f = vi.fn(async () => respuesta(404, {}));
    await crear(f as unknown as typeof fetch).consultarEstado({ tipo: "FACTURA", prefijo: "SETP", numero: 1, cufe: "abc" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.nextpyme.plus/api/ubl2.1/status/document/abc");
    expect(init.method).toBe("POST");
  });

  it("descarga con el nombre de archivo según el tipo", async () => {
    const f = vi.fn(async () => new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 }));
    const p = crear(f as unknown as typeof fetch);
    const pdf = await p.descargar({ tipo: "FACTURA", prefijo: "SETP", numero: 990095240 }, "PDF");
    expect([...pdf]).toEqual([37, 80, 68, 70]);
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe(
      "https://api.nextpyme.plus/api/ubl2.1/download/901000123/FES-SETP990095240.pdf",
    );
    await p.descargar({ tipo: "NOTA_CREDITO", prefijo: "NC", numero: 54 }, "XML");
    expect((f.mock.calls[1] as unknown as [string])[0]).toBe("https://api.nextpyme.plus/api/ubl2.1/download/901000123/NCS-NC54.xml");
  });

  it("descarga fallida lanza ErrorProveedor", async () => {
    const f = vi.fn(async () => respuesta(404, {}));
    await expect(crear(f as unknown as typeof fetch).descargar({ tipo: "FACTURA", prefijo: "S", numero: 1 }, "PDF")).rejects.toThrow(
      /No se pudo descargar/,
    );
  });

  it("probarConexion: GET /config/company con el ambiente real; 401 explica el token", async () => {
    const ok = vi.fn(async () => respuesta(200, { success: true, data: { identification_number: "901000123", type_environment_id: 2 } }));
    expect(await crear(ok as unknown as typeof fetch).probarConexion()).toEqual({ ok: true, ambiente: "PRUEBAS" });
    expect((ok.mock.calls[0] as unknown as [string])[0]).toBe("https://api.nextpyme.plus/api/ubl2.1/config/company");

    const malo = vi.fn(async () => respuesta(401, {}));
    expect(await crear(malo as unknown as typeof fetch).probarConexion()).toEqual({
      ok: false,
      mensaje: "La conexión con el proveedor no es válida. Revisa el token en Configuración del taller.",
    });
  });
  it("buscarEmitido: GET get-uuids con un día antes y uno después de la fecha", async () => {
    const f = vi.fn(async () => respuesta(200, emitidos));
    const r = await crear(f as unknown as typeof fetch).buscarEmitido({ tipo: "FACTURA", prefijo: "FE", numero: 585 }, "2026-10-01");
    expect(r).toEqual({ estado: "ENCONTRADO", cufe: emitidos.documents[0].cufe, total: 60000000 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://api.nextpyme.plus/api/ubl2.1/dian/documents/get-uuids?type_filter=1&start_date=2026-09-30&end_date=2026-10-02",
    );
    expect(init.method).toBe("GET");
  });
});
