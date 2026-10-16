"use client";

import { useCallback, useMemo, useReducer, useRef } from "react";
import type { ResultadoRepuestoMostrador } from "@/app/actions/venta-mostrador-actions";

/** Una línea del carrito: un repuesto del inventario o una línea libre (mano de obra, etc.). */
export interface LineaCarrito {
  /** Repuesto: su id (una sola línea por repuesto). Línea libre: un id propio. */
  id: string;
  repuestoId: string | null;
  descripcion: string;
  codigo?: string;
  precioUnitario: number;
  cantidad: number;
  /** Unidades libres del repuesto al agregarlo: es el tope de la cantidad. `null` en líneas libres. */
  disponible: number | null;
}

/** Lo mínimo que el carrito necesita de un resultado de búsqueda. */
export type RepuestoParaCarrito = Pick<ResultadoRepuestoMostrador, "id" | "codigo" | "nombre" | "precioVenta" | "disponible">;

export type AccionCarrito =
  | { tipo: "agregarRepuesto"; repuesto: RepuestoParaCarrito }
  | { tipo: "agregarLibre"; id: string; descripcion: string; precio: number }
  | { tipo: "cambiarCantidad"; id: string; cantidad: number }
  | { tipo: "quitar"; id: string }
  | { tipo: "vaciar" };

function acotar(cantidad: number, disponible: number | null): number {
  const entera = Number.isFinite(cantidad) ? Math.floor(cantidad) : 1;
  const tope = disponible === null ? Infinity : Math.max(disponible, 1);
  return Math.min(Math.max(entera, 1), tope);
}

/** Reducer puro del carrito (exportado para probarlo sin React). */
export function carritoReducer(lineas: LineaCarrito[], accion: AccionCarrito): LineaCarrito[] {
  switch (accion.tipo) {
    case "agregarRepuesto": {
      const { repuesto } = accion;
      if (repuesto.disponible <= 0) return lineas;
      const existente = lineas.find((linea) => linea.repuestoId === repuesto.id);
      if (existente) {
        // Repetir un producto suma una unidad a su fila, sin pasar del disponible.
        return lineas.map((linea) =>
          linea === existente ? { ...linea, cantidad: acotar(linea.cantidad + 1, linea.disponible) } : linea,
        );
      }
      return [
        ...lineas,
        {
          id: repuesto.id,
          repuestoId: repuesto.id,
          descripcion: repuesto.nombre,
          codigo: repuesto.codigo,
          precioUnitario: repuesto.precioVenta,
          cantidad: 1,
          disponible: repuesto.disponible,
        },
      ];
    }
    case "agregarLibre": {
      const descripcion = accion.descripcion.trim();
      if (descripcion === "" || !Number.isFinite(accion.precio) || accion.precio < 0) return lineas;
      return [
        ...lineas,
        { id: accion.id, repuestoId: null, descripcion, precioUnitario: accion.precio, cantidad: 1, disponible: null },
      ];
    }
    case "cambiarCantidad":
      return lineas.map((linea) =>
        linea.id === accion.id ? { ...linea, cantidad: acotar(accion.cantidad, linea.disponible) } : linea,
      );
    case "quitar":
      return lineas.filter((linea) => linea.id !== accion.id);
    case "vaciar":
      return [];
  }
}

/** Estado local del carrito del mostrador. */
export function useCarrito() {
  const [lineas, despachar] = useReducer(carritoReducer, [] as LineaCarrito[]);
  const contadorLibres = useRef(0);

  const agregarRepuesto = useCallback(
    (repuesto: RepuestoParaCarrito) => despachar({ tipo: "agregarRepuesto", repuesto }),
    [],
  );
  const agregarLibre = useCallback((descripcion: string, precio: number) => {
    contadorLibres.current += 1;
    despachar({ tipo: "agregarLibre", id: `libre-${contadorLibres.current}`, descripcion, precio });
  }, []);
  const cambiarCantidad = useCallback(
    (id: string, cantidad: number) => despachar({ tipo: "cambiarCantidad", id, cantidad }),
    [],
  );
  const quitar = useCallback((id: string) => despachar({ tipo: "quitar", id }), []);
  const vaciar = useCallback(() => despachar({ tipo: "vaciar" }), []);

  const totalUnidades = useMemo(() => lineas.reduce((suma, linea) => suma + linea.cantidad, 0), [lineas]);

  return {
    lineas,
    agregarRepuesto,
    agregarLibre,
    cambiarCantidad,
    quitar,
    vaciar,
    totalUnidades,
    totalProductos: lineas.length,
  };
}

export type Carrito = ReturnType<typeof useCarrito>;
