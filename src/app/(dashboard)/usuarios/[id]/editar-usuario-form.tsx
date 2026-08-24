"use client";

import { useActionState } from "react";
import { updateUsuarioAction, deleteUsuarioAction, type UsuarioFormState } from "@/app/actions/usuario-actions";

const initialState: UsuarioFormState = { error: null, success: false };

export interface EditarUsuarioFormUsuario {
  id: string;
  nombre: string;
  email: string;
  role: "ADMIN" | "TECNICO" | "RECEPCION";
}

export function EditarUsuarioForm({ usuario }: { usuario: EditarUsuarioFormUsuario }) {
  const updateEsteUsuario = updateUsuarioAction.bind(null, usuario.id);
  const [state, formAction, isPending] = useActionState(updateEsteUsuario, initialState);

  return (
    <>
      <form noValidate action={formAction}>
        <label htmlFor="nombre">Nombre</label>
        <input id="nombre" name="nombre" required defaultValue={usuario.nombre} />

        <label htmlFor="email">Correo</label>
        <input id="email" name="email" type="email" required defaultValue={usuario.email} />

        <label htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" defaultValue="" />
        <p>Déjala en blanco para conservar la contraseña actual.</p>

        <label htmlFor="role">Rol</label>
        <select id="role" name="role" defaultValue={usuario.role}>
          <option value="ADMIN">ADMIN</option>
          <option value="TECNICO">TECNICO</option>
          <option value="RECEPCION">RECEPCION</option>
        </select>

        <button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar cambios"}
        </button>

        {state.error ? <p role="alert">{state.error}</p> : null}
        {state.success ? <p role="status">Usuario actualizado</p> : null}
      </form>

      <form action={deleteUsuarioAction.bind(null, usuario.id)}>
        <button type="submit">Eliminar usuario</button>
      </form>
    </>
  );
}
