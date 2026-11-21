// src/lib/factura-electronica/mapear.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { adquirenteDesdeCliente, mapearFactura, type ClienteParaMapear, type FacturaParaMapear } from "./mapear";

const sinDatos: ClienteParaMapear = {
  nombre: "Andrea Valencia Ríos",
  telefono: null,
  email: null,
  documento: null,
  tipoDocumento: null,
  dv: null,
  tipoPersona: null,
  responsabilidadFiscal: null,
  municipioCodigo: null,
  direccion: null,
};

const empresa: ClienteParaMapear = {
  nombre: "Transportes Andinos SAS",
  telefono: "3001234567",
  email: "compras@andinos.co",
  documento: "900.123.456",
  tipoDocumento: "31",
  dv: "8",
  tipoPersona: "JURIDICA",
  responsabilidadFiscal: "O-13",
  municipioCodigo: "05001",
  direccion: "Calle 10 # 20-30",
};

const numeracion = { prefijo: "SETP", numero: 990000001, resolucionNumero: "18760000001", fecha: "2026-11-20", hora: "10:00:00" };

function factura(p: Partial<FacturaParaMapear> = {}): FacturaParaMapear {
  return {
    total: "238000",
    descuento: "0",
    cliente: sinDatos,
    orden: {
      items: [{ id: "i1", descripcion: "Filtro de aceite", cantidad: 2, precioUnitario: "59500", ivaPct: "19" }],
      manoDeObra: [{ id: "m1", descripcion: "Cambio de aceite", valor: "119000", ivaPct: "19" }],
    },
    ...p,
  };
}

describe("mapearFactura", () => {
  it("convierte ítems y mano de obra con IVA incluido; la mano de obra va como servicio con cantidad 1", () => {
    const r = mapearFactura(factura(), numeracion);
    expect(r.documento).toEqual({
      tipo: "FACTURA",
      prefijo: "SETP",
      numero: 990000001,
      resolucionNumero: "18760000001",
      fecha: "2026-11-20",
      hora: "10:00:00",
      adquirente: { tipo: "CONSUMIDOR_FINAL" },
      lineas: [
        { codigo: "i1", descripcion: "Filtro de aceite", cantidad: 2, unidad: "94", precioUnitario: 5000000, descuento: 0, iva: { tarifa: 19 } },
        { codigo: "m1", descripcion: "Cambio de aceite", cantidad: 1, unidad: "ZZ", precioUnitario: 10000000, descuento: 0, iva: { tarifa: 19 } },
      ],
      pago: { forma: "CONTADO", medio: "10", vencimiento: "2026-11-20" },
      enviarCorreo: false,
    });
    expect(r.diferencia).toBe(0);
    expect(r.errores).toEqual([]);
  });

  it("reparte el descuento de la factura entre las líneas", () => {
    const r = mapearFactura(
      factura({
        total: "160650",
        descuento: "17850",
        orden: {
          items: [{ id: "i1", descripcion: "Batería", cantidad: 1, precioUnitario: "119000", ivaPct: "19" }],
          manoDeObra: [{ id: "m1", descripcion: "Instalación", valor: "59500", ivaPct: "19" }],
        },
      }),
      numeracion,
    );
    expect(r.documento.lineas.map((l) => l.precioUnitario)).toEqual([9000000, 4500000]);
    expect(r.diferencia).toBe(0);
  });

  it("informa la diferencia en centavos frente al total guardado en la factura", () => {
    const r = mapearFactura(
      factura({ total: "11900.03", orden: { items: [], manoDeObra: [{ id: "m1", descripcion: "Revisión", valor: "11900.03", ivaPct: "19" }] } }),
      numeracion,
    );
    expect(r.documento.lineas[0].precioUnitario).toBe(1000002);
    expect(r.diferencia).toBe(-1);
  });

  it("con cliente identificado pide enviar el correo", () => {
    expect(mapearFactura(factura({ cliente: empresa }), numeracion).documento.enviarCorreo).toBe(true);
  });
});

describe("adquirenteDesdeCliente", () => {
  it("cliente sin datos: consumidor final, sin errores", () => {
    expect(adquirenteDesdeCliente(sinDatos)).toEqual({ adquirente: { tipo: "CONSUMIDOR_FINAL" }, errores: [] });
  });

  it("persona jurídica completa: identificada, responsable de IVA", () => {
    expect(adquirenteDesdeCliente(empresa)).toEqual({
      adquirente: {
        tipo: "IDENTIFICADO",
        tipoDocumento: "31",
        numeroDocumento: "900.123.456",
        dv: "8",
        nombre: "Transportes Andinos SAS",
        tipoPersona: "JURIDICA",
        regimen: "48",
        responsabilidad: "O-13",
        municipioDane: "05001",
        direccion: "Calle 10 # 20-30",
        telefono: "3001234567",
        email: "compras@andinos.co",
      },
      errores: [],
    });
  });

  it("persona natural no responsable (R-99-PN): régimen 49; jurídica incompleta: dice qué falta", () => {
    const natural = { ...empresa, tipoDocumento: "13", dv: null, tipoPersona: "NATURAL" as const, responsabilidadFiscal: "R-99-PN" };
    const r = adquirenteDesdeCliente(natural);
    expect(r.adquirente).toMatchObject({ tipo: "IDENTIFICADO", regimen: "49", responsabilidad: "R-99-PN" });

    const incompleta = adquirenteDesdeCliente({ ...sinDatos, tipoPersona: "JURIDICA" });
    expect(incompleta.adquirente.tipo).toBe("IDENTIFICADO");
    expect(incompleta.errores.map((e) => e.campo)).toEqual(["cliente.tipoDocumento", "cliente.responsabilidadFiscal"]);
  });
});
