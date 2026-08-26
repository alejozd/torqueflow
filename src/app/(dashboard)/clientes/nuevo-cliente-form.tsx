"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClienteAction, type ClienteFormState } from "@/app/actions/cliente-actions";
import { clienteInputSchema, type ClienteInput } from "@/lib/validation/cliente";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      className="flex flex-col gap-6"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nombre">Nombre</Label>
          <Input
            id="nombre"
            aria-invalid={errors.nombre ? true : undefined}
            aria-describedby={errors.nombre ? "nombre-error" : undefined}
            {...register("nombre")}
          />
          {errors.nombre ? <p id="nombre-error">{errors.nombre.message}</p> : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="telefono">Teléfono</Label>
          <Input
            id="telefono"
            aria-invalid={errors.telefono ? true : undefined}
            aria-describedby={errors.telefono ? "telefono-error" : undefined}
            {...register("telefono")}
          />
          {errors.telefono ? <p id="telefono-error">{errors.telefono.message}</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Correo</Label>
          <Input
            id="email"
            type="email"
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "email-error" : undefined}
            {...register("email")}
          />
          {errors.email ? <p id="email-error">{errors.email.message}</p> : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="documento">Documento</Label>
          <Input
            id="documento"
            aria-invalid={errors.documento ? true : undefined}
            aria-describedby={errors.documento ? "documento-error" : undefined}
            {...register("documento")}
          />
          {errors.documento ? <p id="documento-error">{errors.documento.message}</p> : null}
        </div>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Crear cliente"}
      </Button>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? <p role="status">Cliente creado</p> : null}
    </form>
  );
}
