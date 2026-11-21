// src/lib/factura-electronica/configuracion.ts
import {
  crearProveedor,
  type MemoriaSimulado,
  type ProveedorFacturaElectronica,
  type Resolucion,
} from "@/modulos/factura-electronica";
import type { ConfiguracionFacturaElectronica, Prisma } from "@/generated/prisma-tenant";
import { descifrarSecreto } from "@/lib/crypto/secret-box";

export type ConfiguracionFe = ConfiguracionFacturaElectronica;

/** Falta o no sirve algo de la configuración (token, NIT): seguro no se llamó al proveedor. */
export class ErrorConfiguracionFe extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorConfiguracionFe";
  }
}

export function leerConfiguracionFe(
  db: Pick<Prisma.TransactionClient, "configuracionFacturaElectronica">,
): Promise<ConfiguracionFe | null> {
  return db.configuracionFacturaElectronica.findUnique({ where: { id: "singleton" } });
}

/** Día guardado en @db.Date (medianoche UTC) → "YYYY-MM-DD". */
export function diaIso(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/** Resolución de numeración del núcleo; null si falta cualquier dato. */
export function resolucionDeConfig(c: ConfiguracionFe): Resolucion | null {
  if (!c.resolucionNumero || !c.prefijo || c.rangoDesde === null || c.rangoHasta === null || !c.vigenciaDesde || !c.vigenciaHasta) {
    return null;
  }
  return {
    numero: c.resolucionNumero,
    prefijo: c.prefijo,
    desde: c.rangoDesde,
    hasta: c.rangoHasta,
    vigenciaDesde: diaIso(c.vigenciaDesde),
    vigenciaHasta: diaIso(c.vigenciaHasta),
  };
}

/**
 * Lo que "la DIAN simulada" ya recibió, por taller, mientras viva el proceso: así un
 * CAIDA_RECIBIDO se puede recuperar en el reintento (otra petición, otra instancia).
 */
const memoriasSimulado = new Map<string, MemoriaSimulado>();

export function crearProveedorDesdeConfig(c: ConfiguracionFe, tenantSchema: string): ProveedorFacturaElectronica {
  if (c.ambiente === "SIMULADO") {
    let memoria = memoriasSimulado.get(tenantSchema);
    if (!memoria) {
      memoria = new Map();
      memoriasSimulado.set(tenantSchema, memoria);
    }
    return crearProveedor({ ambiente: "SIMULADO", resultadoSimulado: c.resultadoSimulado, memoriaSimulado: memoria });
  }
  if (!c.tokenCifrado) {
    throw new ErrorConfiguracionFe("Falta el token del proveedor de facturación electrónica. Regístralo en Configuración del taller.");
  }
  if (!c.nit) {
    throw new ErrorConfiguracionFe("Falta el NIT del taller en la configuración de facturación electrónica.");
  }
  let token: string;
  try {
    token = descifrarSecreto(c.tokenCifrado);
  } catch {
    throw new ErrorConfiguracionFe("No se pudo leer el token guardado. Vuelve a registrarlo en Configuración del taller.");
  }
  return crearProveedor({ ambiente: c.ambiente, nextpyme: { token, nitEmisor: c.nit } });
}
