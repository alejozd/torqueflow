"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateBodegaAction, deleteBodegaFormAction, type BodegaFormState } from "@/app/actions/bodega-actions";
import { bodegaInputSchema, type BodegaInput } from "@/lib/validation/inventario";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: BodegaFormState = { error: null, success: false };

export interface BodegaEditable {
  id: string;
  nombre: string;
}

export function EditarBodegaForm({ bodega }: { bodega: BodegaEditable }) {
  const [state, formAction, isPending] = useActionState(
    updateBodegaAction.bind(null, bodega.id),
    initialState,
  );
  const [deleteState, deleteFormAction, isDeletePending] = useActionState(
    deleteBodegaFormAction.bind(null, bodega.id),
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BodegaInput>({
    resolver: zodResolver(bodegaInputSchema),
    defaultValues: { nombre: bodega.nombre },
  });

  return (
    <div className="flex flex-col gap-4">
      <form
        noValidate
        ref={formRef}
        onSubmit={handleSubmit(() => startTransition(() => formAction(new FormData(formRef.current!))))}
        className="flex flex-col gap-4"
      >
        <FormGroup label="Datos">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`nombre-${bodega.id}`}>Nombre</Label>
            <Input
              id={`nombre-${bodega.id}`}
              required
              aria-invalid={errors.nombre ? true : undefined}
              aria-describedby={errors.nombre ? `nombre-${bodega.id}-error` : undefined}
              {...register("nombre")}
            />
            {errors.nombre ? <p id={`nombre-${bodega.id}-error`}>{errors.nombre.message}</p> : null}
          </div>
        </FormGroup>

        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar bodega"}
        </Button>

        {state.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        {state.success ? <p role="status">Bodega actualizada</p> : null}
      </form>

      <form action={deleteFormAction} className="flex flex-col gap-1.5 border-t border-border pt-4">
        <Button type="submit" variant="destructive" disabled={isDeletePending}>
          Eliminar {bodega.nombre}
        </Button>
        {deleteState.error ? (
          <Alert variant="destructive">
            <AlertDescription>{deleteState.error}</AlertDescription>
          </Alert>
        ) : null}
      </form>
    </div>
  );
}
