"use client";

import { useActionState } from "react";
import {
  asignarMecanicoAction,
  type AsignarMecanicoFormState,
  type TecnicoOption,
} from "@/app/actions/orden-actions";
import { Button } from "@/components/ui/button";

const initialState: AsignarMecanicoFormState = { error: null, success: false };

export function AsignarMecanicoForm({
  ordenId,
  mecanicoIdActual,
  tecnicos,
}: {
  ordenId: string;
  mecanicoIdActual: string | null;
  tecnicos: TecnicoOption[];
}) {
  const asignar = asignarMecanicoAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(asignar, initialState);

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
        <select
          // defaultValue only applies on mount -- after a successful save,
          // this component stays mounted while its parent server component
          // re-fetches and passes a new mecanicoIdActual via revalidatePath,
          // which a plain defaultValue would silently ignore. Keying on the
          // value forces React to remount the <select> so it picks up the
          // new default instead of showing the stale one.
          key={mecanicoIdActual ?? "sin-asignar"}
          id="mecanicoId"
          name="mecanicoId"
          defaultValue={mecanicoIdActual ?? ""}
          className="flex h-7 min-w-0 flex-1 items-center justify-between rounded-md border border-input bg-transparent px-1.5 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
        >
          <option value="">Sin asignar</option>
          {tecnicos.map((tecnico) => (
            <option key={tecnico.id} value={tecnico.id}>
              {tecnico.nombre}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="outline" disabled={isPending} className="h-7 shrink-0 px-2 text-xs">
          {isPending ? "..." : "Guardar"}
        </Button>
      </div>
      {state.error ? <p className="text-[10px] text-destructive">{state.error}</p> : null}
      {/* Plain text, not <Alert>: this row lives inside a tight InfoField cell. */}
      {state.success ? (
        <p role="status" className="text-[10px] text-muted-foreground">
          Mecánico actualizado
        </p>
      ) : null}
    </form>
  );
}
