"use client";

import { useActionState } from "react";
import { updateEstadoOrdenAction, type EstadoFormState } from "@/app/actions/orden-actions";
import { ESTADO_ORDEN_TRANSITIONS } from "@/lib/orden/estado-transitions";
import type { EstadoOrden } from "@/generated/prisma-tenant";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";

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
    <form action={formAction} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="estado">Cambiar estado a</Label>
        <SelectField
          id="estado"
          name="estado"
          defaultValue={opciones[0]}
          items={opciones.map((estado) => ({ value: estado, label: ESTADO_LABELS[estado] }))}
        />
      </div>

      <Button type="submit" disabled={isPending} className="self-end">
        {isPending ? "Guardando..." : "Cambiar estado"}
      </Button>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {/* Alert hardcodes role="alert"; a status message must keep role="status" natively. */}
      {state.advertencia ? <p role="status">{state.advertencia}</p> : null}
    </form>
  );
}
