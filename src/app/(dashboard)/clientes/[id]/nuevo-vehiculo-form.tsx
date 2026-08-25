"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createVehiculoAction, type VehiculoFormState } from "@/app/actions/vehiculo-actions";
import { vehiculoInputSchema } from "@/lib/validation/vehiculo";

const initialState: VehiculoFormState = { error: null, success: false };

// createVehiculoAction reads formData.get("anio") || undefined before parsing
// -- an untouched number input submits "", which .optional() alone does not
// treat as absent. Mirrored here so a blank Año does not spuriously fail
// min(1900) client-side the way it never does server-side.
const vehiculoFormSchema = vehiculoInputSchema.extend({
  anio: z.preprocess((v) => (v === "" ? undefined : v), vehiculoInputSchema.shape.anio),
});
type VehiculoFormInput = z.input<typeof vehiculoFormSchema>;

export function NuevoVehiculoForm({ clienteId }: { clienteId: string }) {
  const createVehiculoForCliente = createVehiculoAction.bind(null, clienteId);
  const [state, formAction, isPending] = useActionState(createVehiculoForCliente, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VehiculoFormInput>({
    resolver: zodResolver(vehiculoFormSchema),
    defaultValues: { placa: "", marca: "", modelo: "", anio: "" },
  });

  return (
    <form
      noValidate
      ref={formRef}
      onSubmit={handleSubmit(() => startTransition(() => formAction(new FormData(formRef.current!))))}
    >
      <label htmlFor="placa">Placa</label>
      <input
        id="placa"
        aria-invalid={errors.placa ? true : undefined}
        aria-describedby={errors.placa ? "placa-error" : undefined}
        {...register("placa")}
      />
      {errors.placa ? <p id="placa-error">{errors.placa.message}</p> : null}

      <label htmlFor="marca">Marca</label>
      <input
        id="marca"
        aria-invalid={errors.marca ? true : undefined}
        aria-describedby={errors.marca ? "marca-error" : undefined}
        {...register("marca")}
      />
      {errors.marca ? <p id="marca-error">{errors.marca.message}</p> : null}

      <label htmlFor="modelo">Modelo</label>
      <input
        id="modelo"
        aria-invalid={errors.modelo ? true : undefined}
        aria-describedby={errors.modelo ? "modelo-error" : undefined}
        {...register("modelo")}
      />
      {errors.modelo ? <p id="modelo-error">{errors.modelo.message}</p> : null}

      <label htmlFor="anio">Año</label>
      <input
        id="anio"
        type="number"
        min="1900"
        max="2100"
        aria-invalid={errors.anio ? true : undefined}
        aria-describedby={errors.anio ? "anio-error" : undefined}
        {...register("anio")}
      />
      {errors.anio ? <p id="anio-error">{errors.anio.message}</p> : null}

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Agregar vehículo"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Vehículo agregado</p> : null}
    </form>
  );
}
