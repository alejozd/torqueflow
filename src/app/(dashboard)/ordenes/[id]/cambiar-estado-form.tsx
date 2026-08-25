"use client";

import { useActionState } from "react";
import { updateEstadoOrdenAction, type EstadoFormState } from "@/app/actions/orden-actions";
import { ESTADO_ORDEN_TRANSITIONS } from "@/lib/orden/estado-transitions";
import type { EstadoOrden } from "@/generated/prisma-tenant";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

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
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="estado">Cambiar estado a</Label>
        {/*
          Native <select>, not shadcn's Select (Base UI, no DOM <option>s
          while closed) -- getByRole("option") in the existing tests needs
          real <select>/<option> elements. Styled by hand to match the
          shadcn select trigger look (see seleccionar-sede-form.tsx).
        */}
        <select
          id="estado"
          name="estado"
          defaultValue={opciones[0]}
          className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
        >
          {opciones.map((estado) => (
            <option key={estado} value={estado}>
              {ESTADO_LABELS[estado]}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" disabled={isPending}>
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
