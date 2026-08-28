"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { addManoDeObraAction, type ManoDeObraFormState } from "@/app/actions/mano-de-obra-actions";
import { manoDeObraInputSchema } from "@/lib/validation/orden";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ManoDeObraFormState = { error: null, success: false };

type ManoDeObraFormInput = z.input<typeof manoDeObraInputSchema>;

export function AgregarManoObraForm({ ordenId }: { ordenId: string }) {
  const addManoObra = addManoDeObraAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(addManoObra, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ManoDeObraFormInput>({
    resolver: zodResolver(manoDeObraInputSchema),
    defaultValues: { descripcion: "", valor: "" },
  });

  return (
    <form
      noValidate
      ref={formRef}
      onSubmit={handleSubmit(() => startTransition(() => formAction(new FormData(formRef.current!))))}
      className="flex flex-col gap-4"
    >
      <FormGroup label="Trabajo">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="manoObraDescripcion">Descripción</Label>
            <Input
              id="manoObraDescripcion"
              aria-invalid={errors.descripcion ? true : undefined}
              aria-describedby={errors.descripcion ? "manoObraDescripcion-error" : undefined}
              {...register("descripcion")}
            />
            {errors.descripcion ? <p id="manoObraDescripcion-error">{errors.descripcion.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="manoObraValor">Valor</Label>
            {/* Flat labor charge, no hours captured -- Colombian shops quote mano de obra as a single amount. */}
            <Input
              id="manoObraValor"
              type="number"
              min="0"
              step="0.01"
              className="font-mono"
              aria-invalid={errors.valor ? true : undefined}
              aria-describedby={errors.valor ? "manoObraValor-error" : undefined}
              {...register("valor")}
            />
            {errors.valor ? <p id="manoObraValor-error">{errors.valor.message}</p> : null}
          </div>
        </div>
      </FormGroup>

      <Button type="submit" disabled={isPending} className="self-end">
        {isPending ? "Guardando..." : "Agregar mano de obra"}
      </Button>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? <p role="status">Mano de obra agregada</p> : null}
    </form>
  );
}
