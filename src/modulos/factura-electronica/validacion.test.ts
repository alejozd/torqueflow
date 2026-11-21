// @vitest-environment node
import { describe, expect, it } from "vitest";
import { validarDocumento } from "./validacion";
import type { AdquirenteIdentificado, FacturaVenta, NotaCredito, Resolucion } from "./modelo";

const resolucion: Resolucion = {
  numero: "18760000001",
  prefijo: "SETP",
  desde: 990000000,
  hasta: 995000000,
  vigenciaDesde: "2026-01-01",
  vigenciaHasta: "2027-12-31",
};

const empresa: AdquirenteIdentificado = {
  tipo: "IDENTIFICADO",
  tipoDocumento: "31",
  numeroDocumento: "901249232",
  dv: "0",
  nombre: "NEXTPYME COLOMBIA SAS",
  tipoPersona: "JURIDICA",
  regimen: "48",
  responsabilidad: "R-99-PN",
  municipioDane: "23417",
  direccion: "CLL 18A 11 20",
};

const factura = (p: Partial<FacturaVenta> = {}): FacturaVenta => ({
  tipo: "FACTURA",
  prefijo: "SETP",
  numero: 990000001,
  resolucionNumero: "18760000001",
  fecha: "2026-11-20",
  hora: "10:00:00",
  adquirente: empresa,
  lineas: [
    {
      codigo: "MO1",
      descripcion: "Cambio de aceite",
      cantidad: 1,
      unidad: "94",
      precioUnitario: 8000000,
      descuento: 0,
      iva: { tarifa: 19 },
    },
  ],
  pago: { forma: "CONTADO", medio: "10", vencimiento: "2026-11-20" },
  enviarCorreo: false,
  ...p,
});

const ctx = { resolucion, hoy: "2026-11-20" };
const campos = (errores: { campo: string }[]) => errores.map((e) => e.campo);

describe("validarDocumento — factura", () => {
  it("una factura completa no tiene errores", () => {
    expect(validarDocumento(factura(), ctx)).toEqual([]);
  });

  it("exige al menos un concepto", () => {
    expect(campos(validarDocumento(factura({ lineas: [] }), ctx))).toContain("lineas");
  });

  it("revisa cantidad, decimales, precio y descuento de cada línea", () => {
    const base = factura().lineas[0];
    const errores = validarDocumento(
      factura({
        lineas: [
          { ...base, descripcion: " " },
          { ...base, cantidad: 0 },
          { ...base, cantidad: 1.234 },
          { ...base, precioUnitario: 10.5 },
          { ...base, descuento: 9000000 },
          { ...base, iva: { tarifa: 120 } },
        ],
      }),
      ctx,
    );
    expect(campos(errores)).toEqual([
      "lineas[0].descripcion",
      "lineas[1].cantidad",
      "lineas[2].cantidad",
      "lineas[3].precioUnitario",
      "lineas[4].descuento",
      "lineas[5].iva",
    ]);
  });

  it("revisa el DV del NIT y lo sugiere", () => {
    const errores = validarDocumento(factura({ adquirente: { ...empresa, dv: "7" } }), ctx);
    expect(errores).toEqual([
      { campo: "adquirente.dv", mensaje: "El dígito de verificación del NIT no corresponde (debería ser 0)." },
    ]);
    expect(campos(validarDocumento(factura({ adquirente: { ...empresa, dv: undefined } }), ctx))).toEqual([
      "adquirente.dv",
    ]);
  });

  it("exige documento, nombre, municipio y dirección del cliente", () => {
    const errores = validarDocumento(
      factura({ adquirente: { ...empresa, tipoDocumento: "13", dv: undefined, numeroDocumento: "", nombre: "", municipioDane: "", direccion: "" } }),
      ctx,
    );
    expect(campos(errores)).toEqual([
      "adquirente.numeroDocumento",
      "adquirente.nombre",
      "adquirente.municipioDane",
      "adquirente.direccion",
    ]);
  });

  it("no permite vender a crédito al consumidor final", () => {
    const errores = validarDocumento(
      factura({ adquirente: { tipo: "CONSUMIDOR_FINAL" }, pago: { forma: "CREDITO", medio: "1", vencimiento: "2026-12-20" } }),
      ctx,
    );
    expect(campos(errores)).toEqual(["pago.forma"]);
  });

  it("revisa resolución: existencia, prefijo, número de resolución, rango y vigencia", () => {
    expect(campos(validarDocumento(factura(), { hoy: "2026-11-20" }))).toEqual(["resolucion"]);
    expect(campos(validarDocumento(factura({ prefijo: "FE" }), ctx))).toEqual(["prefijo"]);
    expect(campos(validarDocumento(factura({ resolucionNumero: "1" }), ctx))).toEqual(["resolucionNumero"]);
    expect(validarDocumento(factura({ numero: 995000001 }), ctx)).toEqual([
      { campo: "numero", mensaje: "El número 995000001 está fuera del rango autorizado (990000000 a 995000000)." },
    ]);
    expect(validarDocumento(factura(), { resolucion, hoy: "2028-01-01" })).toEqual([
      { campo: "resolucion", mensaje: "La resolución de numeración venció el 2027-12-31." },
    ]);
    expect(campos(validarDocumento(factura(), { resolucion, hoy: "2025-12-31" }))).toEqual(["resolucion"]);
  });

  it("exige total mayor que cero", () => {
    const base = factura().lineas[0];
    expect(campos(validarDocumento(factura({ lineas: [{ ...base, precioUnitario: 0 }] }), ctx))).toEqual([
      "total",
    ]);
  });
});

describe("validarDocumento — nota crédito", () => {
  const nota = (p: Partial<NotaCredito> = {}): NotaCredito => {
    const { tipo: _t, resolucionNumero: _r, ...resto } = factura();
    return {
      ...resto,
      tipo: "NOTA_CREDITO",
      prefijo: "NC",
      numero: 1,
      concepto: "2",
      motivo: "Anulación de la factura",
      facturaReferencia: { numeroCompleto: "SETP990000001", cufe: "abc123", fecha: "2026-11-20" },
      ...p,
    };
  };

  it("una nota completa no tiene errores y no exige resolución", () => {
    expect(validarDocumento(nota(), { hoy: "2026-11-20" })).toEqual([]);
  });

  it("exige CUFE de la factura y motivo", () => {
    const errores = validarDocumento(
      nota({ motivo: "", facturaReferencia: { numeroCompleto: "SETP990000001", cufe: "", fecha: "2026-11-20" } }),
      { hoy: "2026-11-20" },
    );
    expect(campos(errores)).toEqual(["motivo", "facturaReferencia.cufe"]);
  });
});
