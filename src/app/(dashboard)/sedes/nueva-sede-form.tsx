"use client";

import { useActionState } from "react";
import { createSedeAction, type SedeFormState } from "@/app/actions/sede-actions";

const initialState: SedeFormState = { error: null, success: false };

export function NuevaSedeForm() {
  const [state, formAction, isPending] = useActionState(createSedeAction, initialState);

  return (
    <form noValidate action={formAction}>
      <label htmlFor="nombre">Nombre</label>
      <input id="nombre" name="nombre" required />

      <label htmlFor="direccion">Dirección</label>
      <input id="direccion" name="direccion" />

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Crear sede"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Sede creada</p> : null}
    </form>
  );
}
