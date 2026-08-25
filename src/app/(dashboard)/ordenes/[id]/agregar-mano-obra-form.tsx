"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { addManoDeObraAction, type ManoDeObraFormState } from "@/app/actions/mano-de-obra-actions";
import { manoDeObraInputSchema } from "@/lib/validation/orden";

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
    >
      <label htmlFor="manoObraDescripcion">Descripción</label>
      <input
        id="manoObraDescripcion"
        aria-invalid={errors.descripcion ? true : undefined}
        aria-describedby={errors.descripcion ? "manoObraDescripcion-error" : undefined}
        {...register("descripcion")}
      />
      {errors.descripcion ? <p id="manoObraDescripcion-error">{errors.descripcion.message}</p> : null}

      <label htmlFor="manoObraHoras">Horas</label>
      <input
        id="manoObraHoras"
        type="number"
        min="0.1"
        step="0.1"
        aria-invalid={errors.horas ? true : undefined}
        aria-describedby={errors.horas ? "manoObraHoras-error" : undefined}
        {...register("horas")}
      />
      {errors.horas ? <p id="manoObraHoras-error">{errors.horas.message}</p> : null}

      <label htmlFor="manoObraPrecioHora">Precio por hora</label>
      <input
        id="manoObraPrecioHora"
        type="number"
        min="0"
        step="0.01"
        aria-invalid={errors.precioHora ? true : undefined}
        aria-describedby={errors.precioHora ? "manoObraPrecioHora-error" : undefined}
        {...register("precioHora")}
      />
      {errors.precioHora ? <p id="manoObraPrecioHora-error">{errors.precioHora.message}</p> : null}

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Agregar mano de obra"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Mano de obra agregada</p> : null}
    </form>
  );
}
