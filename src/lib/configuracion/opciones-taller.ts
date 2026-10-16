import type { getTenantDb } from "@/lib/db/tenant-client";
import { CONFIGURACION_TALLER_ID } from "@/lib/vencimientos/configuracion";

/**
 * Opciones de funcionamiento del taller (fase de consolidación, D1 y D3). Las dos
 * casillas vienen apagadas: un taller pequeño trabaja sin firma obligatoria ni caja
 * obligatoria, y quien quiera más control las enciende en Configuración. El tope de
 * descuento de recepción (mostrador, D2) viene en 10 %.
 */
export interface OpcionesTaller {
  /** Entregar la orden exige el acta firmada. */
  exigirActaFirmada: boolean;
  /** Los movimientos en efectivo exigen una caja abierta en la sede. */
  usarControlCaja: boolean;
  /** Porcentaje máximo (0-100) de descuento que puede dar RECEPCION; ADMIN no tiene tope. */
  descuentoMaxRecepcion: number;
}

export const OPCIONES_TALLER_POR_DEFECTO: OpcionesTaller = {
  exigirActaFirmada: false,
  usarControlCaja: false,
  descuentoMaxRecepcion: 10,
};

type LectorConfiguracion = Pick<ReturnType<typeof getTenantDb>, "configuracionTaller">;

/** Sin fila (taller que nunca guardó la configuración) se usan los valores por defecto. */
export async function leerOpcionesTaller(tenantDb: LectorConfiguracion): Promise<OpcionesTaller> {
  const fila = await tenantDb.configuracionTaller.findUnique({
    where: { id: CONFIGURACION_TALLER_ID },
    select: { exigirActaFirmada: true, usarControlCaja: true, descuentoMaxRecepcion: true },
  });
  return fila ?? { ...OPCIONES_TALLER_POR_DEFECTO };
}
