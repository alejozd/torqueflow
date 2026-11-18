"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  actualizarConceptoOrdenAction,
  agregarLibreAOrdenAction,
  agregarRepuestoAOrdenAction,
  buscarParaOrdenAction,
  quitarKitOrdenAction,
} from "@/app/actions/conceptos-orden-actions";
import { deleteItemOrdenFormAction } from "@/app/actions/item-orden-actions";
import { deleteManoDeObraFormAction } from "@/app/actions/mano-de-obra-actions";
import type { TecnicoOption } from "@/app/actions/orden-actions";
import { aplicarServicioAOrdenAction } from "@/app/actions/servicio-actions";
import type { ConceptoVista } from "@/lib/conceptos/conceptos";
import { leerIdConceptoOrden } from "@/lib/orden/conceptos-orden";
import { TablaConceptos, type AdaptadorConceptos } from "@/components/conceptos/tabla-conceptos";
import { SelectField } from "@/components/ui/select-field";
import { useCrearRepuesto, type DatosCrearRepuesto } from "@/components/conceptos/crear-repuesto";

const ESTADO_APLICAR_INICIAL = { error: null, success: false, agregados: null };
const SIN_ASIGNAR = "__sin_asignar__";

/**
 * Conceptos de la orden: la misma tabla de la cotización con las acciones de la
 * orden. La mano de obra muestra su mecánico bajo la descripción y, con permiso
 * de inventario, el buscador ofrece crear un repuesto nuevo y agregarlo.
 */
export function ConceptosOrden({
  ordenId,
  conceptos,
  puedeEditar,
  puedeQuitar,
  tecnicos,
  crearRepuesto,
}: {
  ordenId: string;
  conceptos: ConceptoVista[];
  puedeEditar: boolean;
  puedeQuitar: boolean;
  tecnicos: TecnicoOption[];
  crearRepuesto: DatosCrearRepuesto | null;
}) {
  const router = useRouter();

  const adaptador = useMemo<AdaptadorConceptos>(
    () => ({
      buscar: buscarParaOrdenAction,
      agregarRepuesto: (repuestoId) => agregarRepuestoAOrdenAction(ordenId, repuestoId),
      agregarLibre: (input) => agregarLibreAOrdenAction(ordenId, input),
      async aplicarServicio(servicioId) {
        const formData = new FormData();
        formData.set("servicioId", servicioId);
        const resultado = await aplicarServicioAOrdenAction(ordenId, ESTADO_APLICAR_INICIAL, formData);
        return { error: resultado.error, agregados: resultado.agregados };
      },
      actualizar: (concepto, cambios) => actualizarConceptoOrdenAction(ordenId, concepto.id, cambios),
      async quitar(concepto) {
        const linea = leerIdConceptoOrden(concepto.id);
        if (!linea) return { error: "La línea ya no está en esta orden", success: false };
        return linea.tabla === "item"
          ? deleteItemOrdenFormAction(linea.id, ordenId)
          : deleteManoDeObraFormAction(linea.id, ordenId);
      },
      quitarKit: (grupoKitId) => quitarKitOrdenAction(ordenId, grupoKitId),
    }),
    [ordenId],
  );

  async function cambiarMecanico(concepto: ConceptoVista, valor: string) {
    const mecanicoId = valor === SIN_ASIGNAR ? null : valor;
    if (mecanicoId === (concepto.mecanico?.id ?? null)) return;
    try {
      const resultado = await actualizarConceptoOrdenAction(ordenId, concepto.id, { mecanicoId });
      if (resultado.error) toast.error(resultado.error);
      else router.refresh();
    } catch {
      toast.error("No se pudo cambiar el mecánico");
    }
  }

  const creacion = useCrearRepuesto(crearRepuesto, (repuestoId) => agregarRepuestoAOrdenAction(ordenId, repuestoId));

  function detalleFila(concepto: ConceptoVista) {
    if (concepto.tipo !== "MANO_OBRA") return null;
    if (!puedeEditar) {
      return <p className="mt-1 text-xs text-muted-foreground">Mecánico: {concepto.mecanico?.nombre ?? "Sin asignar"}</p>;
    }
    return (
      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>Mecánico:</span>
        <SelectField
          size="sm"
          aria-label={`Mecánico de ${concepto.descripcion}`}
          className="h-7 w-40 text-xs"
          value={concepto.mecanico?.id ?? SIN_ASIGNAR}
          onValueChange={(valor) => void cambiarMecanico(concepto, valor)}
          items={[
            { value: SIN_ASIGNAR, label: "Sin asignar" },
            ...tecnicos.map((tecnico) => ({ value: tecnico.id, label: tecnico.nombre })),
            // Un mecánico que ya salió de la sede se sigue viendo en su línea.
            ...(concepto.mecanico && !tecnicos.some((tecnico) => tecnico.id === concepto.mecanico?.id)
              ? [{ value: concepto.mecanico.id, label: concepto.mecanico.nombre }]
              : []),
          ]}
        />
      </div>
    );
  }

  return (
    <>
      <TablaConceptos
        adaptador={adaptador}
        conceptos={conceptos}
        puedeEditar={puedeEditar}
        puedeQuitar={puedeQuitar}
        cantidadEntera
        detalleFila={detalleFila}
        crearRepuesto={creacion.abrir}
        textoVacio="Esta orden no tiene conceptos."
      />
      {creacion.dialogo}
    </>
  );
}
