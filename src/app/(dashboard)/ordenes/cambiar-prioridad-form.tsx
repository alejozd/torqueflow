"use client";

import { useActionState, useState } from "react";
import { cambiarPrioridadAction, type PrioridadFormState } from "@/app/actions/orden-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { ETIQUETA_PRIORIDAD } from "@/lib/orden/flujo";
import type { PrioridadOrden } from "@/generated/prisma-tenant";

const initialState: PrioridadFormState = { error: null, success: false };

const NIVELES: { value: PrioridadOrden; label: string }[] = (
  ["URGENTE", "ALTA", "NORMAL", "BAJA"] as PrioridadOrden[]
).map((nivel) => ({ value: nivel, label: ETIQUETA_PRIORIDAD[nivel] }));

/**
 * Cambiar la prioridad de la orden (Fase 22, D3). ADMIN/RECEPCION y solo mientras
 * la orden sea editable; la acción lo vuelve a comprobar en el servidor.
 */
export function CambiarPrioridadForm({ ordenId, prioridad }: { ordenId: string; prioridad: PrioridadOrden }) {
  const cambiar = cambiarPrioridadAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(cambiar, initialState);
  const [elegida, setElegida] = useState<PrioridadOrden>(prioridad);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="flex min-w-36 flex-col gap-1.5">
        <Label htmlFor="prioridad">Prioridad</Label>
        <SelectField
          id="prioridad"
          items={NIVELES}
          value={elegida}
          onValueChange={(valor) => setElegida(valor as PrioridadOrden)}
        />
        <input type="hidden" name="prioridad" value={elegida} />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={isPending || elegida === prioridad}>
        {isPending ? "Guardando..." : "Guardar"}
      </Button>
      {state.error ? (
        <Alert variant="destructive" className="w-full">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? (
        <p role="status" className="w-full text-xs text-muted-foreground">
          Prioridad actualizada.
        </p>
      ) : null}
    </form>
  );
}
