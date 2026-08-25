"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createSedeAction, type SedeFormState } from "@/app/actions/sede-actions";
import { sedeInputSchema, type SedeInput } from "@/lib/validation/sede";

const initialState: SedeFormState = { error: null, success: false };

export function NuevaSedeForm() {
  const [state, formAction, isPending] = useActionState(createSedeAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SedeInput>({
    resolver: zodResolver(sedeInputSchema),
    defaultValues: { nombre: "", direccion: "" },
  });

  return (
    <form
      noValidate
      ref={formRef}
      onSubmit={handleSubmit(() => startTransition(() => formAction(new FormData(formRef.current!))))}
    >
      <label htmlFor="nombre">Nombre</label>
      <input
        id="nombre"
        required
        aria-invalid={errors.nombre ? true : undefined}
        aria-describedby={errors.nombre ? "nombre-error" : undefined}
        {...register("nombre")}
      />
      {errors.nombre ? <p id="nombre-error">{errors.nombre.message}</p> : null}

      <label htmlFor="direccion">Dirección</label>
      <input id="direccion" {...register("direccion")} />

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Crear sede"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Sede creada</p> : null}
    </form>
  );
}
