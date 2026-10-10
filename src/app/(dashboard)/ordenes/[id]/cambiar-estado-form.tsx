"use client";

import { useActionState, useState, type FormEvent } from "react";
import { ConfirmacionEnLinea } from "@/components/confirmacion-en-linea";
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

// Estados después de los cuales la orden ya no se puede editar (mutable-guard.ts).
const CONFIRMACIONES: Partial<Record<EstadoOrden, { pregunta: string; etiqueta: string }>> = {
  ENTREGADA: { pregunta: "¿Marcar la orden como entregada? Ya no se podrá editar.", etiqueta: "Sí, entregar" },
  ANULADA: { pregunta: "¿Anular la orden? Ya no se podrá editar.", etiqueta: "Sí, anular" },
};

export function CambiarEstadoForm({ ordenId, estadoActual }: { ordenId: string; estadoActual: EstadoOrden }) {
  const changeEstado = updateEstadoOrdenAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(changeEstado, initialState);
  const opciones = ESTADO_ORDEN_TRANSITIONS[estadoActual];
  const [confirmando, setConfirmando] = useState<EstadoOrden | null>(null);

  function onSubmit(evento: FormEvent<HTMLFormElement>) {
    const estado = new FormData(evento.currentTarget).get("estado") as EstadoOrden;
    if (CONFIRMACIONES[estado] && confirmando !== estado) {
      evento.preventDefault();
      setConfirmando(estado);
      return;
    }
    setConfirmando(null);
  }

  if (opciones.length === 0) {
    return <p>Estado actual: {ESTADO_LABELS[estadoActual]} (sin más transiciones posibles)</p>;
  }

  return (
    <form action={formAction} onSubmit={onSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="estado">Cambiar estado a</Label>
        <SelectField
          id="estado"
          name="estado"
          defaultValue={opciones[0]}
          onValueChange={() => setConfirmando(null)}
          items={opciones.map((estado) => ({ value: estado, label: ESTADO_LABELS[estado] }))}
        />
      </div>

      {confirmando ? (
        <ConfirmacionEnLinea
          pregunta={CONFIRMACIONES[confirmando]!.pregunta}
          etiquetaConfirmar={CONFIRMACIONES[confirmando]!.etiqueta}
          enviaFormulario
          pendiente={isPending}
          onCancelar={() => setConfirmando(null)}
        />
      ) : (
        <Button type="submit" disabled={isPending} className="self-end">
          {isPending ? "Guardando..." : "Cambiar estado"}
        </Button>
      )}

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
