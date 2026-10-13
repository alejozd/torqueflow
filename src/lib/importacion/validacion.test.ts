import { describe, expect, it } from "vitest";
import { MENSAJE_VIN_INVALIDO } from "@/lib/validation/vehiculo";
import { leerHoja, type LecturaHoja } from "./lectura";
import { porNombre } from "./test-utils";
import {
  buscarCliente,
  indexarClientes,
  validarClientes,
  validarRepuestos,
  validarServicios,
  validarVehiculos,
  type LecturaOk,
} from "./validacion";

function leer(nombreHoja: string, filas: unknown[][]): LecturaOk {
  const lectura: LecturaHoja = leerHoja(porNombre(nombreHoja), filas);
  if (!lectura.ok) throw new Error(`La hoja ${nombreHoja} no se pudo leer: ${lectura.motivo}`);
  return lectura;
}

const CABECERAS_CLIENTES = ["Nombre", "Documento", "Teléfono", "Correo"];
const CABECERAS_VEHICULOS = [
  "Placa",
  "Marca",
  "Modelo",
  "Documento cliente",
  "Nombre cliente",
  "Tipo",
  "Año",
  "Kilometraje",
  "VIN",
  "SOAT vence",
  "Transmisión",
];
const CABECERAS_REPUESTOS = [
  "Código",
  "Nombre",
  "Precio compra",
  "Precio venta",
  "Stock mínimo",
  "Stock máximo",
  "Múltiplo compra",
  "Cantidad inicial",
];
const CABECERAS_SERVICIOS = ["Nombre", "Descripción", "Precio mano de obra", "Activo"];

describe("validarClientes", () => {
  it("normaliza una fila correcta y arma su clave", () => {
    const lectura = leer("Clientes", [CABECERAS_CLIENTES, ["  María   Pérez ", "1.020.456.789", "310 555 1234", "MARIA@Correo.com"]]);

    const { validas, rechazos } = validarClientes(lectura);

    expect(rechazos).toEqual([]);
    expect(validas).toHaveLength(1);
    expect(validas[0]).toEqual({
      numeroFila: 2,
      // Con documento, la clave es el documento: el nombre no participa (dos
      // clientes distintos pueden llamarse igual).
      claves: ["doc:1020456789"],
      nombre: "María Pérez",
      documento: "1.020.456.789",
      telefono: "310 555 1234",
      email: "maria@correo.com",
    });
  });

  it("rechaza sin nombre y con correo inválido, señalando la columna", () => {
    const lectura = leer("Clientes", [CABECERAS_CLIENTES, ["", "1", "", "no-es-correo"]]);

    const { validas, rechazos } = validarClientes(lectura);

    expect(validas).toEqual([]);
    expect(rechazos).toEqual([
      { hoja: "Clientes", fila: 2, columna: "Nombre", valor: null, motivo: "El nombre es obligatorio", tipo: "rechazada" },
      { hoja: "Clientes", fila: 2, columna: "Correo", valor: null, motivo: "Correo inválido", tipo: "rechazada" },
    ]);
  });

  it("trata los huecos típicos como no enviados", () => {
    const lectura = leer("Clientes", [CABECERAS_CLIENTES, ["Ana", "N/A", "—", ""]]);

    const [cliente] = validarClientes(lectura).validas;

    expect(cliente).toEqual({
      numeroFila: 2,
      claves: ["nom:ana"],
      nombre: "Ana",
      documento: null,
      telefono: null,
      email: null,
    });
  });
});

describe("validarVehiculos", () => {
  it("valida una fila completa y guarda la placa como la escribió el taller", () => {
    const lectura = leer("Vehículos", [
      CABECERAS_VEHICULOS,
      ["abc-123", "Renault", "Logan", "1.020", "", "Camioneta", "2021", "85.000", "", "15/03/2027", "Manual"],
    ]);

    const { validas, rechazos } = validarVehiculos(lectura);

    expect(rechazos).toEqual([]);
    const vehiculo = validas[0]!;
    expect(vehiculo.placa).toBe("abc-123");
    expect(vehiculo.claves).toEqual(["placa:ABC123"]);
    expect(vehiculo.tipo).toBe("CAMIONETA");
    expect(vehiculo.transmision).toBe("MECANICA");
    expect(vehiculo.anio).toBe(2021);
    expect(vehiculo.kilometraje).toBe(85000);
    expect(vehiculo.soatVence?.toISOString()).toBe("2027-03-15T00:00:00.000Z");
    expect(vehiculo.documentoCliente).toBe("1.020");
  });

  it("usa CARRO cuando el tipo viene vacío", () => {
    const lectura = leer("Vehículos", [CABECERAS_VEHICULOS, ["ABC123", "Mazda", "2", "1", "", "", "", "", "", "", ""]]);

    expect(validarVehiculos(lectura).validas[0]!.tipo).toBe("CARRO");
  });

  it("rechaza un VIN inválido con el mensaje del proyecto", () => {
    const lectura = leer("Vehículos", [CABECERAS_VEHICULOS, ["ABC123", "Mazda", "2", "1", "", "", "", "", "123", "", ""]]);

    const { validas, rechazos } = validarVehiculos(lectura);

    expect(validas).toEqual([]);
    expect(rechazos).toEqual([
      { hoja: "Vehículos", fila: 2, columna: "VIN", valor: null, motivo: MENSAJE_VIN_INVALIDO, tipo: "rechazada" },
    ]);
  });

  it("rechaza valores que no entiende, con la columna y en español", () => {
    const lectura = leer("Vehículos", [
      CABECERAS_VEHICULOS,
      ["ABC123", "Mazda", "2", "1", "", "Bicicleta", "1800", "-5", "", "31/02/2026", ""],
    ]);

    const motivos = validarVehiculos(lectura).rechazos.map((fila) => [fila.columna, fila.motivo]);

    expect(motivos).toEqual([
      ["Tipo", '"Bicicleta" no es un valor válido. Usa: CARRO, MOTO, CAMIONETA o CAMION'],
      ["Año", "1800 es menor que el mínimo permitido (1900)"],
      ["Kilometraje", "-5 es menor que el mínimo permitido (0)"],
      ["SOAT vence", '"31/02/2026" no es una fecha válida'],
    ]);
  });

  it("exige saber de quién es el vehículo", () => {
    const lectura = leer("Vehículos", [CABECERAS_VEHICULOS, ["ABC123", "Mazda", "2", "", "", "", "", "", "", "", ""]]);

    expect(validarVehiculos(lectura).rechazos).toEqual([
      {
        hoja: "Vehículos",
        fila: 2,
        columna: "Documento cliente",
        valor: null,
        motivo: "Indica el documento o el nombre del cliente del vehículo",
        tipo: "rechazada",
      },
    ]);
  });
});

describe("buscarCliente", () => {
  const indice = indexarClientes([
    { id: "c1", nombre: "María Pérez", documento: "1.020" },
    { id: "c2", nombre: "Beto", documento: null },
  ]);

  const vehiculo = (documentoCliente: string | null, nombreCliente: string | null) =>
    ({ documentoCliente, nombreCliente }) as never;

  it("resuelve por documento y, si no hay documento, por nombre", () => {
    expect(buscarCliente(indice, vehiculo("1020", null))).toEqual({
      estado: "resuelto",
      cliente: { id: "c1", nombre: "María Pérez" },
    });
    expect(buscarCliente(indice, vehiculo(null, "maría pérez"))).toEqual({
      estado: "resuelto",
      cliente: { id: "c1", nombre: "María Pérez" },
    });
    expect(buscarCliente(indice, vehiculo(null, "Beto"))).toEqual({
      estado: "resuelto",
      cliente: { id: "c2", nombre: "Beto" },
    });
  });

  it("con documento no cae al nombre: un homónimo no es ese cliente", () => {
    // Existe un "Beto" sin documento, pero el vehículo dice documento 999: no es
    // el mismo cliente y asignárselo sería un error silencioso.
    expect(buscarCliente(indice, vehiculo("999", "Beto"))).toEqual({ estado: "sin_cliente" });
  });

  it("avisa cuando el nombre lo comparten dos clientes", () => {
    const homonimos = indexarClientes([
      { id: "h1", nombre: "Juan Pérez", documento: null },
      { id: "h2", nombre: "Juan Pérez", documento: null },
    ]);

    expect(buscarCliente(homonimos, vehiculo(null, "Juan Pérez"))).toEqual({ estado: "ambiguo" });
  });

  it("no encuentra a quien no está", () => {
    expect(buscarCliente(indice, vehiculo("9999", null))).toEqual({ estado: "sin_cliente" });
    expect(buscarCliente(indice, vehiculo(null, "Nadie"))).toEqual({ estado: "sin_cliente" });
  });
});

describe("validarRepuestos", () => {
  const opciones = { bodegaId: "b1", proveedorId: null };

  it("acepta una fila sin cantidad inicial y sin proveedor", () => {
    const lectura = leer("Repuestos", [
      CABECERAS_REPUESTOS,
      ["fil-001", "Filtro de aceite", "12.500,50", "25.000", "", "", "", ""],
    ]);

    const { validas, rechazos } = validarRepuestos(lectura, opciones);

    expect(rechazos).toEqual([]);
    expect(validas[0]).toEqual({
      numeroFila: 2,
      claves: ["cod:FIL-001"],
      codigo: "fil-001",
      nombre: "Filtro de aceite",
      descripcion: null,
      precioCompra: 12500.5,
      precioVenta: 25000,
      stockMinimo: 0,
      stockMaximo: null,
      multiploCompra: 1,
      cantidadInicial: 0,
    });
  });

  it("exige proveedor cuando hay cantidad inicial, y lo permite con él", () => {
    const filas = [CABECERAS_REPUESTOS, ["FIL-001", "Filtro", "1.000", "2.000", "", "", "", "10"]];

    const sinProveedor = validarRepuestos(leer("Repuestos", filas), opciones);
    expect(sinProveedor.validas).toEqual([]);
    expect(sinProveedor.rechazos[0]).toEqual({
      hoja: "Repuestos",
      fila: 2,
      columna: "Cantidad inicial",
      valor: null,
      motivo: "Para registrar la cantidad inicial elige un proveedor al subir el archivo (queda como entrada de mercancía)",
      tipo: "rechazada",
    });

    const conProveedor = validarRepuestos(leer("Repuestos", filas), { bodegaId: "b1", proveedorId: "p1" });
    expect(conProveedor.rechazos).toEqual([]);
    expect(conProveedor.validas[0]!.cantidadInicial).toBe(10);
  });

  it("rechaza un precio que no es un número", () => {
    const lectura = leer("Repuestos", [
      CABECERAS_REPUESTOS,
      ["FIL-001", "Filtro", "abc", "2.000", "5", "3", "", ""],
    ]);

    const motivos = validarRepuestos(lectura, opciones).rechazos.map((fila) => [fila.columna, fila.motivo]);

    expect(motivos).toEqual([["Precio compra", '"abc" no es un número']]);
  });

  it("rechaza el stock máximo por debajo del mínimo (regla del proyecto)", () => {
    const lectura = leer("Repuestos", [
      CABECERAS_REPUESTOS,
      ["FIL-001", "Filtro", "1.000", "2.000", "5", "3", "", ""],
    ]);

    const motivos = validarRepuestos(lectura, opciones).rechazos.map((fila) => [fila.columna, fila.motivo]);

    expect(motivos).toEqual([["Stock máximo", "El stock máximo debe ser mayor que el stock mínimo"]]);
  });

  it("rechaza un precio por encima de lo que admite la columna Decimal(10,2)", () => {
    const lectura = leer("Repuestos", [
      CABECERAS_REPUESTOS,
      ["FIL-001", "Filtro", "250.000.000", "2.000", "", "", "", ""],
    ]);

    const rechazos = validarRepuestos(lectura, opciones).rechazos;

    expect(rechazos).toHaveLength(1);
    expect(rechazos[0]!.columna).toBe("Precio compra");
    expect(rechazos[0]!.motivo).toContain("supera el máximo permitido");
  });

  it("rechaza una cantidad inicial por encima del máximo de una línea de inventario", () => {
    const lectura = leer("Repuestos", [
      CABECERAS_REPUESTOS,
      ["FIL-001", "Filtro", "1.000", "2.000", "", "", "", "100.001"],
    ]);

    const rechazos = validarRepuestos(lectura, { bodegaId: "b1", proveedorId: "p1" }).rechazos;

    expect(rechazos[0]!.columna).toBe("Cantidad inicial");
    expect(rechazos[0]!.motivo).toBe("La cantidad no puede superar 100000");
  });
});

describe("validarServicios", () => {
  it("valida una fila y respeta el activo", () => {
    const lectura = leer("Servicios", [
      CABECERAS_SERVICIOS,
      ["Cambio de aceite", "Incluye filtro", "45.000", "no"],
      ["Alineación", "", "30.000", ""],
    ]);

    const { validas, rechazos } = validarServicios(lectura);

    expect(rechazos).toEqual([]);
    expect(validas[0]).toEqual({
      numeroFila: 2,
      claves: ["serv:cambiodeaceite"],
      nombre: "Cambio de aceite",
      descripcion: "Incluye filtro",
      precioManoObra: 45000,
      activo: false,
    });
    expect(validas[1]!.activo).toBe(true);
  });

  it("rechaza una columna Activo que no es sí o no, y un precio que no es número", () => {
    const lectura = leer("Servicios", [CABECERAS_SERVICIOS, ["Alineación", "", "gratis", "tal vez"]]);

    const motivos = validarServicios(lectura).rechazos.map((fila) => [fila.columna, fila.motivo]);

    expect(motivos).toEqual([
      ["Precio mano de obra", '"gratis" no es un número'],
      ["Activo", "Escribe sí o no"],
    ]);
  });

  it("rechaza un nombre demasiado largo con el mensaje del proyecto", () => {
    const lectura = leer("Servicios", [CABECERAS_SERVICIOS, ["x".repeat(81), "", "1.000", ""]]);

    expect(validarServicios(lectura).rechazos[0]).toEqual({
      hoja: "Servicios",
      fila: 2,
      columna: "Nombre",
      valor: null,
      motivo: "El nombre admite máximo 80 caracteres",
      tipo: "rechazada",
    });
  });
});
