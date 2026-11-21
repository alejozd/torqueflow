// src/lib/factura-electronica/configuracion.test.ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FacturaVenta } from "@/modulos/factura-electronica";
import { cifrarSecreto } from "@/lib/crypto/secret-box";
import { crearProveedorDesdeConfig, ErrorConfiguracionFe, resolucionDeConfig, type ConfiguracionFe } from "./configuracion";

const claveOriginal = process.env.SMTP_ENCRYPTION_KEY;
beforeEach(() => {
  process.env.SMTP_ENCRYPTION_KEY = "ab".repeat(32);
});
afterEach(() => {
  process.env.SMTP_ENCRYPTION_KEY = claveOriginal;
});

function config(p: Partial<ConfiguracionFe> = {}): ConfiguracionFe {
  return {
    id: "singleton",
    activa: true,
    envio: "AUTOMATICO",
    ambiente: "SIMULADO",
    cuenta: "BOLSA",
    tokenCifrado: null,
    nit: "901000123",
    dv: "6",
    razonSocial: "Taller de Prueba SAS",
    regimen: "48",
    responsabilidadFiscal: "R-99-PN",
    municipioCodigo: "05001",
    direccion: "Calle 1 # 2-3",
    resolucionNumero: "18760000001",
    prefijo: "SETP",
    rangoDesde: 990000000,
    rangoHasta: 995000000,
    vigenciaDesde: new Date("2026-01-01T00:00:00Z"),
    vigenciaHasta: new Date("2027-12-31T00:00:00Z"),
    siguienteConsecutivo: 1,
    prefijoNotaCredito: null,
    siguienteConsecutivoNotaCredito: 1,
    resultadoSimulado: "ACEPTAR",
    ultimaPruebaAt: null,
    ultimaPruebaExitosa: null,
    ultimaPruebaMensaje: null,
    ambienteProveedor: null,
    createdAt: new Date("2026-11-20T00:00:00Z"),
    updatedAt: new Date("2026-11-20T00:00:00Z"),
    ...p,
  };
}

const factura: FacturaVenta = {
  tipo: "FACTURA",
  prefijo: "SETP",
  numero: 990000001,
  resolucionNumero: "18760000001",
  fecha: "2026-11-20",
  hora: "10:00:00",
  adquirente: { tipo: "CONSUMIDOR_FINAL" },
  lineas: [{ codigo: "A", descripcion: "Aceite", cantidad: 1, unidad: "94", precioUnitario: 5000000, descuento: 0, iva: { tarifa: 19 } }],
  pago: { forma: "CONTADO", medio: "10", vencimiento: "2026-11-20" },
  enviarCorreo: false,
};
const ref = { tipo: "FACTURA" as const, prefijo: "SETP", numero: 990000001 };

describe("resolucionDeConfig", () => {
  it("arma la resolución con las fechas @db.Date como día", () => {
    expect(resolucionDeConfig(config())).toEqual({
      numero: "18760000001",
      prefijo: "SETP",
      desde: 990000000,
      hasta: 995000000,
      vigenciaDesde: "2026-01-01",
      vigenciaHasta: "2027-12-31",
    });
  });

  it("si falta cualquier dato no hay resolución", () => {
    expect(resolucionDeConfig(config({ rangoHasta: null }))).toBeNull();
    expect(resolucionDeConfig(config({ prefijo: null }))).toBeNull();
  });
});

describe("crearProveedorDesdeConfig", () => {
  it("SIMULADO comparte lo recibido entre peticiones del mismo taller, no entre talleres", async () => {
    await crearProveedorDesdeConfig(config(), "taller_config_a").enviar(factura);
    expect((await crearProveedorDesdeConfig(config(), "taller_config_a").buscarEmitido(ref, "2026-11-20")).estado).toBe("ENCONTRADO");
    expect((await crearProveedorDesdeConfig(config(), "taller_config_b").buscarEmitido(ref, "2026-11-20")).estado).toBe(
      "NO_ENCONTRADO",
    );
  });

  it("PRUEBAS sin token lanza un error de configuración; con token cifrado crea el proveedor", () => {
    expect(() => crearProveedorDesdeConfig(config({ ambiente: "PRUEBAS" }), "t")).toThrow(ErrorConfiguracionFe);
    expect(() => crearProveedorDesdeConfig(config({ ambiente: "PRUEBAS", tokenCifrado: "v1:roto" }), "t")).toThrow(
      ErrorConfiguracionFe,
    );
    const p = crearProveedorDesdeConfig(config({ ambiente: "PRUEBAS", tokenCifrado: cifrarSecreto("tok-123") }), "t");
    expect(typeof p.buscarEmitido).toBe("function");
  });
});
