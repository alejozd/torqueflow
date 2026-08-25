"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateUsuarioAction, deleteUsuarioAction, type UsuarioFormState } from "@/app/actions/usuario-actions";
import { usuarioUpdateInputSchema, type UsuarioUpdateInput } from "@/lib/validation/usuario";

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
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UsuarioUpdateInput>({
    resolver: zodResolver(usuarioUpdateInputSchema),
    defaultValues: { nombre: usuario.nombre, email: usuario.email, password: "", role: usuario.role },
  });

  return (
    <>
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
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? "password-error" : undefined}
          {...register("password")}
        />
        <p>Déjala en blanco para conservar la contraseña actual.</p>
        {errors.password ? <p id="password-error">{errors.password.message}</p> : null}

        <label htmlFor="role">Rol</label>
        <select id="role" {...register("role")}>
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
