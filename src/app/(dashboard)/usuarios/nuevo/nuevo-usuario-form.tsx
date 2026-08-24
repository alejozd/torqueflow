"use client";

import { useActionState } from "react";
import { createUsuarioAction, type UsuarioFormState } from "@/app/actions/usuario-actions";

const initialState: UsuarioFormState = { error: null, success: false };

export function NuevoUsuarioForm() {
  const [state, formAction, isPending] = useActionState(createUsuarioAction, initialState);

  return (
    <form noValidate action={formAction}>
      <label htmlFor="nombre">Nombre</label>
      <input id="nombre" name="nombre" required />

      <label htmlFor="email">Correo</label>
      <input id="email" name="email" type="email" required />

      <label htmlFor="password">Contraseña</label>
      <input id="password" name="password" type="password" required minLength={8} />

      <label htmlFor="role">Rol</label>
      <select id="role" name="role" defaultValue="TECNICO">
        <option value="ADMIN">ADMIN</option>
        <option value="TECNICO">TECNICO</option>
        <option value="RECEPCION">RECEPCION</option>
      </select>

      <button type="submit" disabled={isPending}>
        {isPending ? "Creando..." : "Crear usuario"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Usuario creado</p> : null}
    </form>
  );
}
