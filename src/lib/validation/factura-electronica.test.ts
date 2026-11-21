import { describe, expect, it } from "vitest";
import { calcularDvNit } from "@/modulos/factura-electronica";
import { configuracionFeInputSchema, datosFeClienteSchema } from "./factura-electronica";

const NIT = "900123456";
const base = {
  activa: "on",
  envio: "AUTOMATICO",
  ambiente: "PRUEBAS",
  cuenta: "PROPIA",
  token: "",
  nit: NIT,
  dv: calcularDvNit(NIT),
  razonSocial: "Taller Pérez S.A.S.",
  regimen: "48",
  responsabilidadFiscal: "O-13",
  municipioCodigo: "05001",
  direccion: "Calle 10 # 20-30",
  resolucionNumero: "18760000001",
  prefijo: "SETP",
  rangoDesde: "990000000",
  rangoHasta: "995000000",
  vigenciaDesde: "2026-01-01",
  vigenciaHasta: "2027-12-31",
  prefijoNotaCredito: "NC",
  resultadoSimulado: "ACEPTAR",
  confirmarProduccion: "",
};

describe("configuracionFeInputSchema", () => {
  it("acepta una configuración completa y convierte números, fechas y la casilla", () => {
    const r = configuracionFeInputSchema.parse(base);
    expect(r).toMatchObject({ activa: true, rangoDesde: 990000000, rangoHasta: 995000000, vigenciaDesde: "2026-01-01" });
  });

  it("los campos vacíos quedan en null y la casilla sin marcar es false", () => {
    const r = configuracionFeInputSchema.parse({ ...base, activa: "", nit: "", dv: "", rangoDesde: "", vigenciaHasta: "" });
    expect(r).toMatchObject({ activa: false, nit: null, dv: null, rangoDesde: null, vigenciaHasta: null });
  });

  it("rechaza un DV que no corresponde al NIT", () => {
    const dvMalo = String((Number(calcularDvNit(NIT)) + 1) % 10);
    const r = configuracionFeInputSchema.safeParse({ ...base, dv: dvMalo });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("El dígito de verificación no corresponde al NIT.");
  });

  it("rechaza un rango al revés y una vigencia al revés", () => {
    expect(configuracionFeInputSchema.safeParse({ ...base, rangoDesde: "10", rangoHasta: "5" }).success).toBe(false);
    expect(
      configuracionFeInputSchema.safeParse({ ...base, vigenciaDesde: "2027-01-01", vigenciaHasta: "2026-01-01" }).success,
    ).toBe(false);
  });

  it("rechaza municipio que no son 5 dígitos y responsabilidad desconocida", () => {
    expect(configuracionFeInputSchema.safeParse({ ...base, municipioCodigo: "5001" }).success).toBe(false);
    expect(configuracionFeInputSchema.safeParse({ ...base, responsabilidadFiscal: "X-1" }).success).toBe(false);
  });
});

describe("datosFeClienteSchema", () => {
  it("acepta datos completos y deja en null lo vacío", () => {
    expect(
      datosFeClienteSchema.parse({
        tipoDocumento: "13",
        dv: "",
        tipoPersona: "NATURAL",
        responsabilidadFiscal: "R-99-PN",
        municipioCodigo: "11001",
        direccion: "Cra 7 # 1-2",
      }),
    ).toEqual({
      tipoDocumento: "13",
      dv: null,
      tipoPersona: "NATURAL",
      responsabilidadFiscal: "R-99-PN",
      municipioCodigo: "11001",
      direccion: "Cra 7 # 1-2",
    });
  });

  it("rechaza tipo de documento desconocido", () => {
    expect(
      datosFeClienteSchema.safeParse({
        tipoDocumento: "99",
        dv: "",
        tipoPersona: "",
        responsabilidadFiscal: "",
        municipioCodigo: "",
        direccion: "",
      }).success,
    ).toBe(false);
  });
});
