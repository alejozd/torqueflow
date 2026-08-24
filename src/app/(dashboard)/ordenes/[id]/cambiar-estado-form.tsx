"use client";

import { useActionState } from "react";
import { updateEstadoOrdenAction, type EstadoFormState } from "@/app/actions/orden-actions";
import { ESTADO_ORDEN_TRANSITIONS } from "@/lib/orden/estado-transitions";
import type { EstadoOrden } from "@/generated/prisma-tenant";

const initialState: EstadoFormState = { error: null, advertencia: null };

const ESTADO_LABELS: Record<EstadoOrden, string> = {
  BORRADOR: "Borrador",
  EN_PROCESO: "En proceso",
  TERMINADA: "Terminada",
  ENTREGADA: "Entregada",
  ANULADA: "Anulada",
};

export function CambiarEstadoForm({ ordenId, estadoActual }: { ordenId: string; estadoActual: EstadoOrden }) {
  const changeEstado = updateEstadoOrdenAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(changeEstado, initialState);
  const opciones = ESTADO_ORDEN_TRANSITIONS[estadoActual];

  if (opciones.length === 0) {
    return <p>Estado actual: {ESTADO_LABELS[estadoActual]} (sin más transiciones posibles)</p>;
  }

  return (
    <form action={formAction}>
      <label htmlFor="estado">Cambiar estado a</label>
      <select id="estado" name="estado" defaultValue={opciones[0]}>
        {opciones.map((estado) => (
          <option key={estado} value={estado}>
            {ESTADO_LABELS[estado]}
          </option>
        ))}
      </select>

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Cambiar estado"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.advertencia ? <p role="status">{state.advertencia}</p> : null}
    </form>
  );
}
