"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createProveedorAction, type ProveedorFormState } from "@/app/actions/proveedor-actions";
import { proveedorInputSchema, type ProveedorInput } from "@/lib/validation/inventario";

const initialState: ProveedorFormState = { error: null, success: false };

export function NuevoProveedorForm() {
  const [state, formAction, isPending] = useActionState(createProveedorAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProveedorInput>({
    resolver: zodResolver(proveedorInputSchema),
    defaultValues: { nombre: "", contacto: "", telefono: "", email: "" },
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

      <label htmlFor="contacto">Contacto</label>
      <input id="contacto" {...register("contacto")} />

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

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Crear proveedor"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Proveedor creado</p> : null}
    </form>
  );
}
