"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createBodegaAction, type BodegaFormState } from "@/app/actions/bodega-actions";
import { bodegaInputSchema, type BodegaInput } from "@/lib/validation/inventario";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: BodegaFormState = { error: null, success: false };

export function NuevoBodegaForm() {
  const [state, formAction, isPending] = useActionState(createBodegaAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BodegaInput>({ resolver: zodResolver(bodegaInputSchema), defaultValues: { nombre: "" } });

  return (
    <form
      noValidate
      ref={formRef}
      onSubmit={handleSubmit(() => startTransition(() => formAction(new FormData(formRef.current!))))}
      className="flex flex-col gap-4"
    >
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

      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Crear bodega"}
      </Button>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? <p role="status">Bodega creada</p> : null}
    </form>
  );
}
