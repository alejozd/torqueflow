"use client";

import { useActionState } from "react";
import { createBodegaAction, type BodegaFormState } from "@/app/actions/bodega-actions";

const initialState: BodegaFormState = { error: null, success: false };

export function NuevoBodegaForm() {
  const [state, formAction, isPending] = useActionState(createBodegaAction, initialState);

  return (
    <form noValidate action={formAction}>
      <label htmlFor="nombre">Nombre</label>
      <input id="nombre" name="nombre" required />

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Crear bodega"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Bodega creada</p> : null}
    </form>
  );
}
