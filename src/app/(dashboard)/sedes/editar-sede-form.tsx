"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateSedeAction, deleteSedeFormAction, type SedeFormState } from "@/app/actions/sede-actions";
import { sedeInputSchema, type SedeInput } from "@/lib/validation/sede";
import type { Sede } from "@/generated/prisma-tenant";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`nombre-${sede.id}`}>Nombre de {sede.nombre}</Label>
          <Input
            id={`nombre-${sede.id}`}
            required
            aria-invalid={errors.nombre ? true : undefined}
            aria-describedby={errors.nombre ? `nombre-${sede.id}-error` : undefined}
            {...register("nombre")}
          />
          {errors.nombre ? <p id={`nombre-${sede.id}-error`}>{errors.nombre.message}</p> : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`direccion-${sede.id}`}>Dirección de {sede.nombre}</Label>
          <Input
            id={`direccion-${sede.id}`}
            aria-invalid={errors.direccion ? true : undefined}
            aria-describedby={errors.direccion ? `direccion-${sede.id}-error` : undefined}
            {...register("direccion")}
          />
          {errors.direccion ? <p id={`direccion-${sede.id}-error`}>{errors.direccion.message}</p> : null}
        </div>

        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar sede"}
        </Button>

        {state.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        {state.success ? <p role="status">Sede actualizada</p> : null}
      </form>

      <form action={deleteFormAction} className="flex flex-col gap-1.5">
        <Button type="submit" variant="destructive" disabled={isDeletePending}>
          Eliminar {sede.nombre}
        </Button>
        {deleteState.error ? (
          <Alert variant="destructive">
            <AlertDescription>{deleteState.error}</AlertDescription>
          </Alert>
        ) : null}
      </form>
    </>
  );
}
