"use client";

import { useActionState } from "react";
import {
  asignarMecanicoAction,
  type AsignarMecanicoFormState,
  type TecnicoOption,
} from "@/app/actions/orden-actions";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";

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
        {/*
          Native <select>, not shadcn's Select -- matches this page's other
          selects (see cambiar-estado-form.tsx) and keeps getByRole("option")
          working in tests.
        */}
        <NativeSelect
          // defaultValue only applies on mount -- if ADMIN corrects an
          // already-assigned mecánico, this component stays mounted across
          // the revalidatePath re-render, so a plain defaultValue would
          // silently ignore the new value. Keying on it forces a remount.
          key={mecanico?.id ?? "sin-asignar"}
          id="mecanicoId"
          name="mecanicoId"
          defaultValue={mecanico?.id ?? ""}
          className="h-7 min-w-0 flex-1 rounded-md px-1.5 pr-6 text-xs"
        >
          <option value="">Sin asignar</option>
          {tecnicos.map((tecnico) => (
            <option key={tecnico.id} value={tecnico.id}>
              {tecnico.nombre}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" size="sm" variant="outline" disabled={isPending} className="h-7 shrink-0 px-2 text-xs">
          {isPending ? "..." : mecanico ? "Guardar" : "Asignar"}
        </Button>
      </div>
      {state.error ? <p className="text-[10px] text-destructive">{state.error}</p> : null}
    </form>
  );
}
