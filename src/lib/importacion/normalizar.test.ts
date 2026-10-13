import { describe, expect, it } from "vitest";
import {
  esVacio,
  normalizarBooleano,
  normalizarClave,
  normalizarCodigo,
  normalizarEncabezado,
  normalizarEntero,
  normalizarFecha,
  normalizarNumero,
  normalizarPlaca,
  normalizarTexto,
} from "./normalizar";

describe("normalizarEncabezado", () => {
  it("ignora tildes, mayúsculas, espacios y separadores", () => {
    expect(normalizarEncabezado("  Teléfono ")).toBe("telefono");
    expect(normalizarEncabezado("Vehículos")).toBe("vehiculos");
    expect(normalizarEncabezado("correo_electrónico")).toBe("correoelectronico");
    expect(normalizarEncabezado("Precio  Compra")).toBe("preciocompra");
  });

  it("quita el BOM que Excel deja al guardar como UTF-8", () => {
    expect(normalizarEncabezado("\uFEFFNombre")).toBe("nombre");
  });

  it("ignora el asterisco con que la plantilla marca las columnas obligatorias", () => {
    expect(normalizarEncabezado("Nombre *")).toBe("nombre");
    expect(normalizarEncabezado("Precio mano de obra *")).toBe("preciomanodeobra");
  });

  it("no inventa nada con celdas vacías o que no son texto", () => {
    expect(normalizarEncabezado(null)).toBe("");
    expect(normalizarEncabezado(undefined)).toBe("");
    expect(normalizarEncabezado(123)).toBe("123");
  });
});

describe("normalizarTexto y claves", () => {
  it("recorta y colapsa espacios internos", () => {
    expect(normalizarTexto("  María   Pérez  ")).toBe("María Pérez");
    expect(normalizarTexto(null)).toBe("");
    expect(normalizarTexto(1234)).toBe("1234");
  });

  it("normalizarClave deja la forma comparable", () => {
    expect(normalizarClave("1.020.456.789")).toBe("1020456789");
    expect(normalizarClave("María  PÉREZ")).toBe("mariaperez");
    expect(normalizarClave(" ABC-123 ")).toBe("abc123");
  });

  it("placas y códigos quedan en mayúsculas sin separadores", () => {
    expect(normalizarPlaca(" abc-123 ")).toBe("ABC123");
    expect(normalizarPlaca("ABC 123")).toBe("ABC123");
    expect(normalizarCodigo(" fil-001 ")).toBe("FIL-001");
    expect(normalizarCodigo("fil 001")).toBe("FIL001");
  });
});

describe("normalizarNumero (formato colombiano)", () => {
  it("acepta coma decimal", () => {
    expect(normalizarNumero("1500,50")).toBe(1500.5);
    expect(normalizarNumero("0,5")).toBe(0.5);
  });

  it("acepta punto de miles con coma decimal", () => {
    expect(normalizarNumero("1.500,50")).toBe(1500.5);
    expect(normalizarNumero("1.234.567,89")).toBe(1234567.89);
  });

  it("interpreta el punto suelto según los dígitos que le siguen", () => {
    // Tres dígitos detrás = separador de miles (uso colombiano).
    expect(normalizarNumero("12.500")).toBe(12500);
    // Dos dígitos detrás = decimal (nadie escribe 1,50 como "1.50" por miles).
    expect(normalizarNumero("12.50")).toBe(12.5);
  });

  it("también entiende el formato inglés cuando es inequívoco", () => {
    expect(normalizarNumero("1,500.50")).toBe(1500.5);
    expect(normalizarNumero("1500.50")).toBe(1500.5);
  });

  it("limpia símbolos de moneda y espacios", () => {
    expect(normalizarNumero("$ 1.500")).toBe(1500);
    expect(normalizarNumero("COP 1.500,25")).toBe(1500.25);
  });

  it("acepta números y negativos", () => {
    expect(normalizarNumero(1500.5)).toBe(1500.5);
    expect(normalizarNumero("-1.500,50")).toBe(-1500.5);
    expect(normalizarNumero(-3)).toBe(-3);
  });

  it("devuelve null cuando no hay número", () => {
    expect(normalizarNumero("abc")).toBeNull();
    expect(normalizarNumero("")).toBeNull();
    expect(normalizarNumero(null)).toBeNull();
    expect(normalizarNumero("—")).toBeNull();
    expect(normalizarNumero("1,2,3")).toBeNull();
  });

  it("normalizarEntero redondea y rechaza los decimales con fracción", () => {
    expect(normalizarEntero("12")).toBe(12);
    expect(normalizarEntero("12,0")).toBe(12);
    expect(normalizarEntero(12)).toBe(12);
    expect(normalizarEntero("12,5")).toBeNull();
    expect(normalizarEntero("abc")).toBeNull();
    expect(normalizarEntero("-3")).toBe(-3);
  });
});

describe("normalizarFecha", () => {
  it("acepta dd/mm/aaaa y devuelve medianoche UTC (como el resto del proyecto)", () => {
    expect(normalizarFecha("15/03/2027")?.toISOString()).toBe("2027-03-15T00:00:00.000Z");
    expect(normalizarFecha("1/3/2027")?.toISOString()).toBe("2027-03-01T00:00:00.000Z");
  });

  it("acepta guiones, puntos y año de dos dígitos", () => {
    expect(normalizarFecha("15-03-2027")?.toISOString()).toBe("2027-03-15T00:00:00.000Z");
    expect(normalizarFecha("15.03.2027")?.toISOString()).toBe("2027-03-15T00:00:00.000Z");
    expect(normalizarFecha("15/03/27")?.toISOString()).toBe("2027-03-15T00:00:00.000Z");
  });

  it("acepta ISO y objetos Date (lo que entrega el lector de xlsx)", () => {
    expect(normalizarFecha("2027-03-15")?.toISOString()).toBe("2027-03-15T00:00:00.000Z");
    expect(normalizarFecha(new Date("2027-03-15T00:00:00.000Z"))?.toISOString()).toBe("2027-03-15T00:00:00.000Z");
  });

  it("acepta la serie numérica de Excel", () => {
    expect(normalizarFecha(1)?.toISOString()).toBe("1900-01-01T00:00:00.000Z");
    expect(normalizarFecha(61)?.toISOString()).toBe("1900-03-01T00:00:00.000Z");
    // Ida y vuelta contra el epoch real de Excel.
    const dia = new Date("2027-03-15T00:00:00.000Z");
    const serie = Math.round((dia.getTime() - Date.UTC(1899, 11, 30)) / 86_400_000);
    expect(normalizarFecha(serie)?.toISOString()).toBe("2027-03-15T00:00:00.000Z");
  });

  it("rechaza fechas que no existen", () => {
    expect(normalizarFecha("31/02/2026")).toBeNull();
    expect(normalizarFecha("15/13/2026")).toBeNull();
    expect(normalizarFecha("2026-02-30")).toBeNull();
    expect(normalizarFecha("abc")).toBeNull();
    expect(normalizarFecha("")).toBeNull();
    expect(normalizarFecha(null)).toBeNull();
    expect(normalizarFecha(new Date("invalid"))).toBeNull();
  });
});

describe("normalizarBooleano y esVacio", () => {
  it("entiende las formas en que se escribe sí y no", () => {
    for (const si of ["sí", "si", "SI", "s", "x", "1", "true", "verdadero"]) {
      expect(normalizarBooleano(si)).toBe(true);
    }
    for (const no of ["no", "NO", "n", "false", "0", "falso"]) {
      expect(normalizarBooleano(no)).toBe(false);
    }
    expect(normalizarBooleano(true)).toBe(true);
    expect(normalizarBooleano(false)).toBe(false);
    expect(normalizarBooleano("")).toBeNull();
    expect(normalizarBooleano("tal vez")).toBeNull();
  });

  it("esVacio reconoce los huecos típicos de una hoja", () => {
    for (const vacio of [null, undefined, "", "   ", "—", "-", "N/A", "n/a"]) {
      expect(esVacio(vacio)).toBe(true);
    }
    expect(esVacio(0)).toBe(false);
    expect(esVacio("0")).toBe(false);
    expect(esVacio("no")).toBe(false);
  });
});
