"use client";

import { useActionState } from "react";
import { createProveedorAction, type ProveedorFormState } from "@/app/actions/proveedor-actions";

const initialState: ProveedorFormState = { error: null, success: false };

export function NuevoProveedorForm() {
  const [state, formAction, isPending] = useActionState(createProveedorAction, initialState);

  return (
    <form noValidate action={formAction}>
      <label htmlFor="nombre">Nombre</label>
      <input id="nombre" name="nombre" required />

      <label htmlFor="contacto">Contacto</label>
      <input id="contacto" name="contacto" />

      <label htmlFor="telefono">Teléfono</label>
      <input id="telefono" name="telefono" />

      <label htmlFor="email">Correo</label>
      <input id="email" name="email" type="email" />

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Crear proveedor"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Proveedor creado</p> : null}
    </form>
  );
}
