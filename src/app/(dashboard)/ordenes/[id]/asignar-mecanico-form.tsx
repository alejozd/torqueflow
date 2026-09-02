"use client";

import { useActionState } from "react";
import {
  asignarMecanicoAction,
  type AsignarMecanicoFormState,
  type TecnicoOption,
} from "@/app/actions/orden-actions";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";

const initialState: AsignarMecanicoFormState = { error: null, success: false };

export function AsignarMecanicoForm({
  ordenId,
  mecanico,
  tecnicos,
  puedeReasignar = false,
}: {
  ordenId: string;
  mecanico: { id: string; nombre: string } | null;
  tecnicos: TecnicoOption[];
  /** Una vez asignado, la asignación queda fija salvo para ADMIN (ver asignarMecanicoAction). */
  puedeReasignar?: boolean;
}) {
  const asignar = asignarMecanicoAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(asignar, initialState);

  // Una vez asignado el mecánico, la asignación es permanente para
  // RECEPCION: no se vuelve a mostrar el formulario, solo el nombre en
  // texto plano. ADMIN sigue viendo el selector para poder corregirlo.
  if (mecanico && !puedeReasignar) {
    return <p className="text-sm">{mecanico.nombre}</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <label htmlFor="mecanicoId" className="sr-only">
          Mecánico asignado
        </label>
        <SelectField
          // defaultValue only applies on mount -- if ADMIN corrects an
          // already-assigned mecánico, this component stays mounted across
          // the revalidatePath re-render, so a plain defaultValue would
          // silently ignore the new value. Keying on it forces a remount.
          key={mecanico?.id ?? "sin-asignar"}
          id="mecanicoId"
          name="mecanicoId"
          defaultValue={mecanico?.id ?? ""}
          // Base UI's Select treats an empty-string value as "no selection"
          // (hasSelectedValue is false), so the trigger falls back to the
          // placeholder text rather than the "Sin asignar" item's own label
          // -- set it explicitly so the trigger reads the same either way.
          placeholder="Sin asignar"
          size="sm"
          className="h-7 min-w-0 flex-1 px-1.5 text-xs"
          items={[
            { value: "", label: "Sin asignar" },
            ...tecnicos.map((tecnico) => ({ value: tecnico.id, label: tecnico.nombre })),
          ]}
        />
        <Button type="submit" size="sm" variant="outline" disabled={isPending} className="h-7 shrink-0 px-2 text-xs">
          {isPending ? "..." : mecanico ? "Guardar" : "Asignar"}
        </Button>
      </div>
      {state.error ? <p className="text-[10px] text-destructive">{state.error}</p> : null}
    </form>
  );
}
