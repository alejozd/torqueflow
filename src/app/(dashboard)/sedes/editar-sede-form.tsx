"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateSedeAction, deleteSedeFormAction, type SedeFormState } from "@/app/actions/sede-actions";
import { sedeInputSchema, type SedeInput } from "@/lib/validation/sede";
import type { Sede } from "@/generated/prisma-tenant";

const initialState: SedeFormState = { error: null, success: false };

export function EditarSedeForm({ sede }: { sede: Sede }) {
  const [state, formAction, isPending] = useActionState(
    updateSedeAction.bind(null, sede.id),
    initialState,
  );
  const [deleteState, deleteFormAction, isDeletePending] = useActionState(
    deleteSedeFormAction.bind(null, sede.id),
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SedeInput>({
    resolver: zodResolver(sedeInputSchema),
    defaultValues: { nombre: sede.nombre, direccion: sede.direccion ?? "" },
  });

  return (
    <>
      <form
        noValidate
        ref={formRef}
        onSubmit={handleSubmit(() => startTransition(() => formAction(new FormData(formRef.current!))))}
      >
        <label htmlFor={`nombre-${sede.id}`}>Nombre de {sede.nombre}</label>
        <input
          id={`nombre-${sede.id}`}
          required
          aria-invalid={errors.nombre ? true : undefined}
          aria-describedby={errors.nombre ? `nombre-${sede.id}-error` : undefined}
          {...register("nombre")}
        />
        {errors.nombre ? <p id={`nombre-${sede.id}-error`}>{errors.nombre.message}</p> : null}

        <label htmlFor={`direccion-${sede.id}`}>Dirección de {sede.nombre}</label>
        <input id={`direccion-${sede.id}`} {...register("direccion")} />

        <button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar sede"}
        </button>

        {state.error ? <p role="alert">{state.error}</p> : null}
        {state.success ? <p role="status">Sede actualizada</p> : null}
      </form>

      <form action={deleteFormAction}>
        <button type="submit" disabled={isDeletePending}>
          Eliminar {sede.nombre}
        </button>
        {deleteState.error ? <p role="alert">{deleteState.error}</p> : null}
      </form>
    </>
  );
}
