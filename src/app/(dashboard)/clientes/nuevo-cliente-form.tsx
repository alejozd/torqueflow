"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClienteAction, type ClienteFormState } from "@/app/actions/cliente-actions";
import { clienteInputSchema, type ClienteInput } from "@/lib/validation/cliente";

const initialState: ClienteFormState = { error: null, success: false };

export function NuevoClienteForm() {
  const [state, formAction, isPending] = useActionState(createClienteAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ClienteInput>({
    resolver: zodResolver(clienteInputSchema),
    defaultValues: { nombre: "", telefono: "", email: "", documento: "" },
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
        aria-invalid={errors.nombre ? true : undefined}
        aria-describedby={errors.nombre ? "nombre-error" : undefined}
        {...register("nombre")}
      />
      {errors.nombre ? <p id="nombre-error">{errors.nombre.message}</p> : null}

      <label htmlFor="telefono">Teléfono</label>
      <input id="telefono" {...register("telefono")} />

      <label htmlFor="email">Correo</label>
      <input
        id="email"
        type="email"
        aria-invalid={errors.email ? true : undefined}
        aria-describedby={errors.email ? "email-error" : undefined}
        {...register("email")}
      />
      {errors.email ? <p id="email-error">{errors.email.message}</p> : null}

      <label htmlFor="documento">Documento</label>
      <input id="documento" {...register("documento")} />

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Crear cliente"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Cliente creado</p> : null}
    </form>
  );
}
