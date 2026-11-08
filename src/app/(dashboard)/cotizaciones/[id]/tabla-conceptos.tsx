"use client";

import { useMemo } from "react";
import { eliminarItemCotizacionFormAction } from "@/app/actions/cotizacion-actions";
import {
  actualizarItemCotizacionAction,
  agregarItemLibreCotizacionAction,
  agregarRepuestoACotizacionAction,
  eliminarGrupoKitCotizacionAction,
} from "@/app/actions/cotizacion-items-actions";
import { buscarParaCotizacionAction } from "@/app/actions/buscar-cotizacion-actions";
import { aplicarServicioACotizacionAction } from "@/app/actions/servicio-actions";
import type { ConceptoVista } from "@/lib/cotizacion/agrupar-conceptos";
import { TablaConceptos as TablaCompartida, type AdaptadorConceptos } from "@/components/conceptos/tabla-conceptos";

const ESTADO_APLICAR_INICIAL = { error: null, success: false, agregados: null };

/**
 * Tabla de conceptos de la cotización: la tabla compartida con la orden
 * (`components/conceptos/tabla-conceptos.tsx`) con las acciones de la cotización.
 */
export function TablaConceptos({
  cotizacionId,
  conceptos,
  puedeEditar,
}: {
  cotizacionId: string;
  conceptos: ConceptoVista[];
  puedeEditar: boolean;
}) {
  const adaptador = useMemo<AdaptadorConceptos>(
    () => ({
      buscar: buscarParaCotizacionAction,
      async agregarRepuesto(repuestoId) {
        const resultado = await agregarRepuestoACotizacionAction(cotizacionId, repuestoId);
        return { error: resultado.error, conceptoId: resultado.itemId, fusionado: resultado.fusionado };
      },
      async agregarLibre(input) {
        const resultado = await agregarItemLibreCotizacionAction(cotizacionId, input);
        return { error: resultado.error, conceptoId: resultado.itemId };
      },
      async aplicarServicio(servicioId) {
        const formData = new FormData();
        formData.set("servicioId", servicioId);
        const resultado = await aplicarServicioACotizacionAction(cotizacionId, ESTADO_APLICAR_INICIAL, formData);
        return { error: resultado.error, agregados: resultado.agregados };
      },
      async actualizar(concepto, cambios) {
        const resultado = await actualizarItemCotizacionAction(cotizacionId, concepto.id, cambios);
        return { error: resultado.error, conceptoId: resultado.itemId };
      },
      quitar: (concepto) => eliminarItemCotizacionFormAction(concepto.id, cotizacionId),
      async quitarKit(grupoKitId) {
        const resultado = await eliminarGrupoKitCotizacionAction(cotizacionId, grupoKitId);
        return { error: resultado.error, success: resultado.error === null };
      },
    }),
    [cotizacionId],
  );

  return (
    <TablaCompartida
      adaptador={adaptador}
      conceptos={conceptos}
      puedeEditar={puedeEditar}
      puedeQuitar={puedeEditar}
      textoVacio="Esta cotización no tiene conceptos."
    />
  );
}
