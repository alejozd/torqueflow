// src/modulos/factura-electronica/proveedores/nextpyme/mapear.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mapearDocumentoNextpyme } from "./mapear";
import type { AdquirenteIdentificado, FacturaVenta, NotaCredito } from "../../modelo";

const cliente: AdquirenteIdentificado = {
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
  telefono: "3017882489",
  email: "soporte@nextpyme.plus",
};

const factura: FacturaVenta = {
  tipo: "FACTURA",
  prefijo: "SETP",
  numero: 990000001,
  resolucionNumero: "18760000001",
  fecha: "2026-11-20",
  hora: "10:30:00",
  adquirente: cliente,
  lineas: [
    { codigo: "MO1", descripcion: "Mano de obra", cantidad: 1.5, unidad: "HUR", precioUnitario: 6000000, descuento: 1000000, iva: { tarifa: 19 } },
    { codigo: "R1", descripcion: "Filtro", cantidad: 1, unidad: "94", precioUnitario: 2000000, descuento: 0, iva: null },
  ],
  pago: { forma: "CREDITO", medio: "47", vencimiento: "2026-12-20" },
  enviarCorreo: true,
};

describe("mapearDocumentoNextpyme — factura", () => {
  const json = mapearDocumentoNextpyme(factura);

  it("encabezado, cliente y forma de pago con IDs de Nextpyme", () => {
    expect(json).toMatchObject({
      type_document_id: 1,
      date: "2026-11-20",
      time: "10:30:00",
      prefix: "SETP",
      number: 990000001,
      resolution_number: "18760000001",
      sendmail: true,
      customer: {
        identification_number: "901249232",
        dv: "0",
        name: "NEXTPYME COLOMBIA SAS",
        phone: "3017882489",
        address: "CLL 18A 11 20",
        email: "soporte@nextpyme.plus",
        merchant_registration: "0000000-00",
        type_document_identification_id: 6,
        type_organization_id: 1,
        type_liability_id: 117,
        municipality_id: 439,
        type_regime_id: 1,
      },
      payment_form: { payment_form_id: 2, payment_method_id: 47, payment_due_date: "2026-12-20", duration_measure: "30" },
    });
  });

  it("totales en texto con dos decimales; la línea excluida no entra en la base", () => {
    // MO: 60.000 × 1,5 = 90.000 − 10.000 = 80.000; IVA 15.200. Filtro: 20.000 sin IVA.
    expect(json.legal_monetary_totals).toEqual({
      line_extension_amount: "100000.00",
      tax_exclusive_amount: "80000.00",
      tax_inclusive_amount: "115200.00",
      allowance_total_amount: "0.00",
      charge_total_amount: "0.00",
      payable_amount: "115200.00",
    });
    expect(json.tax_totals).toEqual([{ tax_id: 1, tax_amount: "15200.00", percent: "19.00", taxable_amount: "80000.00" }]);
  });

  it("líneas con descuento, IVA y unidad", () => {
    expect(json.invoice_lines).toEqual([
      {
        unit_measure_id: 730,
        invoiced_quantity: "1.50",
        line_extension_amount: "80000.00",
        free_of_charge_indicator: false,
        allowance_charges: [
          { charge_indicator: false, allowance_charge_reason: "DESCUENTO", amount: "10000.00", base_amount: "90000.00" },
        ],
        tax_totals: [{ tax_id: 1, tax_amount: "15200.00", percent: "19.00", taxable_amount: "80000.00" }],
        description: "Mano de obra",
        code: "MO1",
        type_item_identification_id: 4,
        price_amount: "60000.00",
        base_quantity: "1.00",
      },
      {
        unit_measure_id: 70,
        invoiced_quantity: "1.00",
        line_extension_amount: "20000.00",
        free_of_charge_indicator: false,
        description: "Filtro",
        code: "R1",
        type_item_identification_id: 4,
        price_amount: "20000.00",
        base_quantity: "1.00",
      },
    ]);
  });

  it("consumidor final: solo los tres campos y sin correo", () => {
    const cf = mapearDocumentoNextpyme({
      ...factura,
      adquirente: { tipo: "CONSUMIDOR_FINAL" },
      pago: { forma: "CONTADO", medio: "10", vencimiento: "2026-11-20" },
    });
    expect(cf.customer).toEqual({ identification_number: 222222222222, name: "CONSUMIDOR FINAL", merchant_registration: "0000000-00" });
    expect(cf.sendmail).toBe(false);
    expect(cf.payment_form).toMatchObject({ payment_form_id: 1, payment_method_id: 10, duration_measure: "0" });
  });

  it("sin líneas con IVA no envía tax_totals", () => {
    const sinIva = mapearDocumentoNextpyme({ ...factura, lineas: [factura.lineas[1]] });
    expect(sinIva).not.toHaveProperty("tax_totals");
  });

  it("falla con un mensaje claro si el municipio no existe", () => {
    expect(() => mapearDocumentoNextpyme({ ...factura, adquirente: { ...cliente, municipioDane: "99999" } })).toThrow(
      'Nextpyme no reconoce el municipio con código DIAN "99999".',
    );
  });
});

describe("mapearDocumentoNextpyme — nota crédito", () => {
  const nota: NotaCredito = {
    tipo: "NOTA_CREDITO",
    prefijo: "NC",
    numero: 54,
    fecha: "2026-11-21",
    hora: "09:00:00",
    adquirente: cliente,
    lineas: factura.lineas,
    pago: factura.pago,
    enviarCorreo: false,
    concepto: "2",
    motivo: "Anulación total de la factura",
    facturaReferencia: { numeroCompleto: "SETP990000001", cufe: "3571981e", fecha: "2026-11-20" },
  };
  const json = mapearDocumentoNextpyme(nota);

  it("usa credit_note_lines, el concepto y la referencia a la factura", () => {
    expect(json).toMatchObject({
      type_document_id: 4,
      prefix: "NC",
      number: 54,
      discrepancyresponsecode: 2,
      discrepancyresponsedescription: "Anulación total de la factura",
      billing_reference: { number: "SETP990000001", uuid: "3571981e", issue_date: "2026-11-20" },
    });
    expect(json).toHaveProperty("credit_note_lines");
    expect(json).not.toHaveProperty("invoice_lines");
    expect(json).not.toHaveProperty("resolution_number");
  });
});
