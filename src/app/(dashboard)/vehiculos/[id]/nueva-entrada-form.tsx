"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addHistorialEntryAction, type HistorialFormState } from "@/app/actions/historial-actions";
import { historialInputSchema, type HistorialInput } from "@/lib/validation/historial";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: HistorialFormState = { error: null, success: false };

export function NuevaEntradaForm({ vehiculoId }: { vehiculoId: string }) {
  const addEntryForVehiculo = addHistorialEntryAction.bind(null, vehiculoId);
  const [state, formAction, isPending] = useActionState(addEntryForVehiculo, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<HistorialInput>({
    resolver: zodResolver(historialInputSchema),
    defaultValues: { descripcion: "" },
  });

  return (
    <form
      noValidate
      ref={formRef}
      onSubmit={handleSubmit(() => startTransition(() => formAction(new FormData(formRef.current!))))}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="descripcion">Descripción</Label>
        <Textarea
          id="descripcion"
          required
          aria-invalid={errors.descripcion ? true : undefined}
          aria-describedby={errors.descripcion ? "descripcion-error" : undefined}
          {...register("descripcion")}
        />
        {errors.descripcion ? <p id="descripcion-error">{errors.descripcion.message}</p> : null}
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Registrar"}
      </Button>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? <p role="status">Entrada registrada</p> : null}
    </form>
  );
}
