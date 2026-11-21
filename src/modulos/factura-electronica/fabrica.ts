// src/modulos/factura-electronica/fabrica.ts
import type { ProveedorFacturaElectronica } from "./proveedor";
import { crearProveedorNextpyme, type OpcionesNextpyme } from "./proveedores/nextpyme/proveedor";
import { crearProveedorSimulado, type MemoriaSimulado, type ResultadoSimulado } from "./proveedores/simulado";

export type Ambiente = "SIMULADO" | "PRUEBAS" | "PRODUCCION";

export interface ConfigProveedor {
  ambiente: Ambiente;
  /** Solo para SIMULADO. */
  resultadoSimulado?: ResultadoSimulado;
  /** Solo para SIMULADO: lo ya "recibido" por la DIAN simulada, para compartirlo entre instancias. */
  memoriaSimulado?: MemoriaSimulado;
  /** Obligatorio en PRUEBAS y PRODUCCION. */
  nextpyme?: OpcionesNextpyme;
}

export function crearProveedor(config: ConfigProveedor): ProveedorFacturaElectronica {
  if (config.ambiente === "SIMULADO") {
    return crearProveedorSimulado({ resultado: config.resultadoSimulado, memoria: config.memoriaSimulado });
  }
  if (!config.nextpyme?.token) {
    throw new Error("Falta el token del proveedor de facturación electrónica.");
  }
  return crearProveedorNextpyme(config.nextpyme);
}
