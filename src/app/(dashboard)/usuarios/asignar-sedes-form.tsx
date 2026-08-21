"use client";

import { useActionState } from "react";
import {
  setUsuarioSedesAction,
  type UsuarioConSedes,
  type UsuarioSedesFormState,
} from "@/app/actions/usuario-actions";

const initialState: UsuarioSedesFormState = { error: null, success: false };

export interface SedeCheckboxOption {
  id: string;
  nombre: string;
}

export function AsignarSedesForm({
  usuario,
  sedes,
}: {
  usuario: UsuarioConSedes;
  sedes: SedeCheckboxOption[];
}) {
  const [state, formAction, isPending] = useActionState(
    setUsuarioSedesAction.bind(null, usuario.id),
    initialState,
  );

  return (
    <form noValidate action={formAction}>
      {sedes.map((sede) => {
        const inputId = `sede-${sede.id}-usuario-${usuario.id}`;
        return (
          <div key={sede.id}>
            <input
              id={inputId}
              type="checkbox"
              name="sedeIds"
              value={sede.id}
              defaultChecked={usuario.sedeIds.includes(sede.id)}
            />
            <label htmlFor={inputId}>
              {sede.nombre} para {usuario.nombre}
            </label>
          </div>
        );
      })}

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : `Guardar sedes de ${usuario.nombre}`}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Sedes actualizadas</p> : null}
    </form>
  );
}
