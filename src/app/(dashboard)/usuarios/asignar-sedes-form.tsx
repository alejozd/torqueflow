"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  setUsuarioSedesAction,
  type UsuarioConSedes,
  type UsuarioSedesFormState,
} from "@/app/actions/usuario-actions";
import { usuarioSedesInputSchema, type UsuarioSedesInput } from "@/lib/validation/sede";

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
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UsuarioSedesInput>({
    resolver: zodResolver(usuarioSedesInputSchema),
    defaultValues: { sedeIds: usuario.sedeIds },
  });
  const sedesErrorId = `sedeIds-error-${usuario.id}`;

  return (
    <form
      noValidate
      ref={formRef}
      onSubmit={handleSubmit(() => startTransition(() => formAction(new FormData(formRef.current!))))}
    >
      {sedes.map((sede) => {
        const inputId = `sede-${sede.id}-usuario-${usuario.id}`;
        return (
          <div key={sede.id}>
            <input
              id={inputId}
              type="checkbox"
              value={sede.id}
              aria-describedby={errors.sedeIds ? sedesErrorId : undefined}
              {...register("sedeIds")}
            />
            <label htmlFor={inputId}>
              {sede.nombre} para {usuario.nombre}
            </label>
          </div>
        );
      })}
      {errors.sedeIds ? <p id={sedesErrorId}>{errors.sedeIds.message}</p> : null}

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : `Guardar sedes de ${usuario.nombre}`}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Sedes actualizadas</p> : null}
    </form>
  );
}
