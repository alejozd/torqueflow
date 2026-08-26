"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createProveedorAction, type ProveedorFormState } from "@/app/actions/proveedor-actions";
import { proveedorInputSchema, type ProveedorInput } from "@/lib/validation/inventario";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      className="flex flex-col gap-4"
    >
      <FormGroup label="Empresa">
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
            <Label htmlFor="contacto">Contacto</Label>
            <Input
              id="contacto"
              aria-invalid={errors.contacto ? true : undefined}
              aria-describedby={errors.contacto ? "contacto-error" : undefined}
              {...register("contacto")}
            />
            {errors.contacto ? <p id="contacto-error">{errors.contacto.message}</p> : null}
          </div>
        </div>
      </FormGroup>

      <FormGroup label="Contacto">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="telefono">Teléfono</Label>
            <Input
              id="telefono"
              className="font-mono"
              aria-invalid={errors.telefono ? true : undefined}
              aria-describedby={errors.telefono ? "telefono-error" : undefined}
              {...register("telefono")}
            />
            {errors.telefono ? <p id="telefono-error">{errors.telefono.message}</p> : null}
          </div>

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
        </div>
      </FormGroup>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Crear proveedor"}
      </Button>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? <p role="status">Proveedor creado</p> : null}
    </form>
  );
}
