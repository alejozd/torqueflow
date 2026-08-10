"use client";

import { useActionState } from "react";
import { createClienteAction, type ClienteFormState } from "@/app/actions/cliente-actions";

const initialState: ClienteFormState = { error: null, success: false };

export function NuevoClienteForm() {
  const [state, formAction, isPending] = useActionState(createClienteAction, initialState);

  return (
    <form action={formAction}>
      <label htmlFor="nombre">Nombre</label>
      <input id="nombre" name="nombre" />

      <label htmlFor="telefono">Teléfono</label>
      <input id="telefono" name="telefono" />

      <label htmlFor="email">Correo</label>
      <input id="email" name="email" type="email" />

      <label htmlFor="documento">Documento</label>
      <input id="documento" name="documento" />

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Crear cliente"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Cliente creado</p> : null}
    </form>
  );
}
