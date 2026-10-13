import { describe, expect, it } from "vitest";
import { HOJAS, HOJA_INSTRUCCIONES, MAX_FILAS_POR_HOJA, buscarHoja, resolverColumnas } from "./hojas";

const porNombre = (nombre: string) => HOJAS.find((hoja) => hoja.nombre === nombre)!;

describe("contrato de hojas", () => {
  it("tiene las cuatro entidades en orden de dependencias", () => {
    expect(HOJAS.map((hoja) => hoja.nombre)).toEqual(["Clientes", "Vehículos", "Repuestos", "Servicios"]);
  });

  it("cada hoja declara sus columnas obligatorias y su clave de duplicado", () => {
    expect(porNombre("Clientes").claveDuplicado).toBe("documento");
    expect(porNombre("Vehículos").claveDuplicado).toBe("placa");
    expect(porNombre("Repuestos").claveDuplicado).toBe("codigo");
    expect(porNombre("Servicios").claveDuplicado).toBe("nombre");

    const obligatorias = (nombre: string) =>
      porNombre(nombre)
        .columnas.filter((columna) => columna.obligatoria)
        .map((columna) => columna.clave);

    expect(obligatorias("Clientes")).toEqual(["nombre"]);
    expect(obligatorias("Vehículos")).toEqual(["placa", "marca", "modelo"]);
    expect(obligatorias("Repuestos")).toEqual(["codigo", "nombre", "precioCompra", "precioVenta"]);
    expect(obligatorias("Servicios")).toEqual(["nombre", "precioManoObra"]);
  });

  it("no repite encabezados ni claves dentro de una hoja y trae ejemplo en todas", () => {
    for (const hoja of HOJAS) {
      const encabezados = hoja.columnas.map((columna) => columna.encabezado);
      const claves = hoja.columnas.map((columna) => columna.clave);
      expect(new Set(encabezados).size).toBe(encabezados.length);
      expect(new Set(claves).size).toBe(claves.length);
      expect(hoja.columnas.every((columna) => columna.ejemplo.length > 0)).toBe(true);
    }
  });

  it("busca la hoja ignorando tildes, mayúsculas y espacios", () => {
    expect(buscarHoja("Vehículos")?.nombre).toBe("Vehículos");
    expect(buscarHoja("vehiculos")?.nombre).toBe("Vehículos");
    expect(buscarHoja(" REPUESTOS ")?.nombre).toBe("Repuestos");
    expect(buscarHoja("Otra cosa")).toBeNull();
    expect(buscarHoja(null)).toBeNull();
  });
});

describe("resolverColumnas", () => {
  it("empareja por encabezado exacto y por alias", () => {
    const hoja = porNombre("Clientes");
    const { indices, faltantes } = resolverColumnas(
      hoja,
      ["Nombre", "Cédula", "Celular", "correo electrónico"].map((valor) => valor as unknown),
    );

    expect(faltantes).toEqual([]);
    expect(indices.get("nombre")).toBe(0);
    expect(indices.get("documento")).toBe(1);
    expect(indices.get("telefono")).toBe(2);
    expect(indices.get("email")).toBe(3);
  });

  it("reporta las columnas obligatorias que faltan y no confunde columnas parecidas", () => {
    const hoja = porNombre("Repuestos");
    const { indices, faltantes } = resolverColumnas(
      hoja,
      ["Nombre", "Precio venta", "Precio compra"].map((valor) => valor as unknown),
    );

    expect(faltantes).toEqual(["codigo"]);
    expect(indices.get("precioVenta")).toBe(1);
    expect(indices.get("precioCompra")).toBe(2);
  });

  it("en Vehículos distingue el nombre del cliente del nombre del vehículo", () => {
    const hoja = porNombre("Vehículos");
    const { indices, faltantes } = resolverColumnas(
      hoja,
      ["Placa", "Marca", "Modelo", "Cliente", "Documento"].map((valor) => valor as unknown),
    );

    expect(faltantes).toEqual([]);
    expect(indices.get("nombreCliente")).toBe(3);
    expect(indices.get("documentoCliente")).toBe(4);
  });

  it("ignora encabezados vacíos y columnas que no están en el contrato", () => {
    const hoja = porNombre("Servicios");
    const { indices, faltantes } = resolverColumnas(
      hoja,
      ["Nombre", "", "Color favorito", "Precio"].map((valor) => valor as unknown),
    );

    expect(faltantes).toEqual([]);
    expect(indices.get("nombre")).toBe(0);
    expect(indices.get("precioManoObra")).toBe(3);
    expect(indices.size).toBe(2);
  });
});

describe("topes de la importación", () => {
  it("declara los límites acordados", () => {
    expect(MAX_FILAS_POR_HOJA).toBe(2000);
    expect(HOJA_INSTRUCCIONES).toBe("Instrucciones");
  });
});
