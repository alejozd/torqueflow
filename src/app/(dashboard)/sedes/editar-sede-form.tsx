"use client";

import { useActionState } from "react";
import { updateSedeAction, deleteSedeAction, type SedeFormState } from "@/app/actions/sede-actions";
import type { Sede } from "@/generated/prisma-tenant";

const initialState: SedeFormState = { error: null, success: false };

export function EditarSedeForm({ sede }: { sede: Sede }) {
  const [state, formAction, isPending] = useActionState(
    updateSedeAction.bind(null, sede.id),
    initialState,
  );

  return (
    <>
      <form noValidate action={formAction}>
        <label htmlFor={`nombre-${sede.id}`}>Nombre de {sede.nombre}</label>
        <input id={`nombre-${sede.id}`} name="nombre" defaultValue={sede.nombre} required />

        <label htmlFor={`direccion-${sede.id}`}>Dirección de {sede.nombre}</label>
        <input id={`direccion-${sede.id}`} name="direccion" defaultValue={sede.direccion ?? ""} />

        <button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar sede"}
        </button>

        {state.error ? <p role="alert">{state.error}</p> : null}
        {state.success ? <p role="status">Sede actualizada</p> : null}
      </form>

      <form action={deleteSedeAction.bind(null, sede.id)}>
        <button type="submit">Eliminar {sede.nombre}</button>
      </form>
    </>
  );
}
