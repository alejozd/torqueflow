import { describe, expect, it } from "vitest";
import { carritoReducer, type LineaCarrito, type RepuestoParaCarrito } from "./use-carrito";

const FILTRO: RepuestoParaCarrito = { id: "r1", codigo: "FLT-1", nombre: "Filtro", precioVenta: 50000, disponible: 3 };
const BUJIA: RepuestoParaCarrito = { id: "r2", codigo: "BJ-4", nombre: "Bujía", precioVenta: 20000, disponible: 1 };

function agregar(lineas: LineaCarrito[], repuesto: RepuestoParaCarrito) {
  return carritoReducer(lineas, { tipo: "agregarRepuesto", repuesto });
}

describe("carritoReducer", () => {
  it("agregar un repuesto nuevo crea la fila con cantidad 1 y su tope", () => {
    const [linea] = agregar([], FILTRO);
    expect(linea).toMatchObject({ repuestoId: "r1", codigo: "FLT-1", cantidad: 1, disponible: 3, precioUnitario: 50000 });
  });

  it("repetir un repuesto suma 1 a su fila sin duplicarla", () => {
    const lineas = agregar(agregar([], FILTRO), FILTRO);
    expect(lineas).toHaveLength(1);
    expect(lineas[0].cantidad).toBe(2);
  });

  it("la fusión no pasa del disponible", () => {
    let lineas = agregar([], BUJIA);
    lineas = agregar(lineas, BUJIA);
    expect(lineas[0].cantidad).toBe(1);
  });

  it("un repuesto sin disponible no se agrega", () => {
    expect(agregar([], { ...FILTRO, disponible: 0 })).toEqual([]);
  });

  it("cambiar la cantidad respeta el mínimo 1 y el tope", () => {
    const base = agregar([], FILTRO);
    expect(carritoReducer(base, { tipo: "cambiarCantidad", id: "r1", cantidad: 99 })[0].cantidad).toBe(3);
    expect(carritoReducer(base, { tipo: "cambiarCantidad", id: "r1", cantidad: 0 })[0].cantidad).toBe(1);
    expect(carritoReducer(base, { tipo: "cambiarCantidad", id: "r1", cantidad: 2.7 })[0].cantidad).toBe(2);
  });

  it("quitar saca solo esa fila y vaciar deja el carrito en blanco", () => {
    const dos = agregar(agregar([], FILTRO), BUJIA);
    expect(carritoReducer(dos, { tipo: "quitar", id: "r1" }).map((l) => l.id)).toEqual(["r2"]);
    expect(carritoReducer(dos, { tipo: "vaciar" })).toEqual([]);
  });

  it("la línea libre guarda descripción y precio, no tiene tope y no se fusiona", () => {
    let lineas = carritoReducer([], { tipo: "agregarLibre", id: "libre-1", descripcion: " Mano de obra ", precio: 28000 });
    lineas = carritoReducer(lineas, { tipo: "agregarLibre", id: "libre-2", descripcion: "Mano de obra", precio: 28000 });
    expect(lineas).toHaveLength(2);
    expect(lineas[0]).toMatchObject({ repuestoId: null, descripcion: "Mano de obra", disponible: null, cantidad: 1 });
    expect(carritoReducer(lineas, { tipo: "cambiarCantidad", id: "libre-1", cantidad: 50 })[0].cantidad).toBe(50);
  });

  it("una línea libre sin descripción o con precio negativo se ignora", () => {
    expect(carritoReducer([], { tipo: "agregarLibre", id: "l", descripcion: "  ", precio: 10 })).toEqual([]);
    expect(carritoReducer([], { tipo: "agregarLibre", id: "l", descripcion: "x", precio: -1 })).toEqual([]);
  });
});
