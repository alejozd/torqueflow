"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createUsuarioAction, type UsuarioFormState } from "@/app/actions/usuario-actions";
import { usuarioCreateInputSchema, type UsuarioCreateInput } from "@/lib/validation/usuario";

const initialState: UsuarioFormState = { error: null, success: false };

export function NuevoUsuarioForm() {
  const [state, formAction, isPending] = useActionState(createUsuarioAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UsuarioCreateInput>({
    resolver: zodResolver(usuarioCreateInputSchema),
    defaultValues: { nombre: "", email: "", password: "", role: "TECNICO" },
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

      <label htmlFor="email">Correo</label>
      <input
        id="email"
        type="email"
        required
        aria-invalid={errors.email ? true : undefined}
        aria-describedby={errors.email ? "email-error" : undefined}
        {...register("email")}
      />
      {errors.email ? <p id="email-error">{errors.email.message}</p> : null}

      <label htmlFor="password">Contraseña</label>
      <input
        id="password"
        type="password"
        required
        minLength={8}
        aria-invalid={errors.password ? true : undefined}
        aria-describedby={errors.password ? "password-error" : undefined}
        {...register("password")}
      />
      {errors.password ? <p id="password-error">{errors.password.message}</p> : null}

      <label htmlFor="role">Rol</label>
      <select id="role" {...register("role")}>
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
