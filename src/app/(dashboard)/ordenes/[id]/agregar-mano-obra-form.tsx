"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { addManoDeObraAction, type ManoDeObraFormState } from "@/app/actions/mano-de-obra-actions";
import { manoDeObraInputSchema } from "@/lib/validation/orden";
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
    defaultValues: { descripcion: "", horas: "", precioHora: "" },
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
          <Label htmlFor="manoObraHoras">Horas</Label>
          <Input
            id="manoObraHoras"
            type="number"
            min="0.1"
            step="0.1"
            aria-invalid={errors.horas ? true : undefined}
            aria-describedby={errors.horas ? "manoObraHoras-error" : undefined}
            {...register("horas")}
          />
          {errors.horas ? <p id="manoObraHoras-error">{errors.horas.message}</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="manoObraPrecioHora">Precio por hora</Label>
          <Input
            id="manoObraPrecioHora"
            type="number"
            min="0"
            step="0.01"
            aria-invalid={errors.precioHora ? true : undefined}
            aria-describedby={errors.precioHora ? "manoObraPrecioHora-error" : undefined}
            {...register("precioHora")}
          />
          {errors.precioHora ? <p id="manoObraPrecioHora-error">{errors.precioHora.message}</p> : null}
        </div>
      </div>

      <Button type="submit" disabled={isPending}>
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
