"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createOrdenAction, type OrdenFormState, type TecnicoOption } from "@/app/actions/orden-actions";
import { ordenTrabajoInputSchema } from "@/lib/validation/orden";

const initialState: OrdenFormState = { error: null, success: false };

// createOrdenAction reads formData.get("kilometrajeIngreso") || undefined
// before parsing -- an untouched number input submits "", which
// .optional() alone does not treat as absent.
const ordenFormSchema = ordenTrabajoInputSchema.extend({
  kilometrajeIngreso: z.preprocess(
    (v) => (v === "" ? undefined : v),
    ordenTrabajoInputSchema.shape.kilometrajeIngreso,
  ),
});
type OrdenFormInput = z.input<typeof ordenFormSchema>;

export function NuevaOrdenForm({
  clienteId,
  vehiculoId,
  tecnicos,
}: {
  clienteId: string;
  vehiculoId: string;
  tecnicos: TecnicoOption[];
}) {
  const createForVehiculo = createOrdenAction.bind(null, clienteId, vehiculoId);
  const [state, formAction, isPending] = useActionState(createForVehiculo, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OrdenFormInput>({
    resolver: zodResolver(ordenFormSchema),
    defaultValues: { kilometrajeIngreso: "", sintomas: "", mecanicoId: "" },
  });

  return (
    <form
      noValidate
      ref={formRef}
      onSubmit={handleSubmit(() => startTransition(() => formAction(new FormData(formRef.current!))))}
    >
      <label htmlFor="kilometrajeIngreso">Kilometraje de ingreso</label>
      <input
        id="kilometrajeIngreso"
        type="number"
        min="0"
        aria-invalid={errors.kilometrajeIngreso ? true : undefined}
        aria-describedby={errors.kilometrajeIngreso ? "kilometrajeIngreso-error" : undefined}
        {...register("kilometrajeIngreso")}
      />
      {errors.kilometrajeIngreso ? <p id="kilometrajeIngreso-error">{errors.kilometrajeIngreso.message}</p> : null}

      <label htmlFor="sintomas">Síntomas reportados</label>
      <textarea id="sintomas" {...register("sintomas")} />

      <label htmlFor="mecanicoId">Mecánico asignado</label>
      <select id="mecanicoId" {...register("mecanicoId")}>
        <option value="">Sin asignar</option>
        {tecnicos.map((tecnico) => (
          <option key={tecnico.id} value={tecnico.id}>
            {tecnico.nombre}
          </option>
        ))}
      </select>

      <button type="submit" disabled={isPending}>
        {isPending ? "Creando..." : "Crear orden"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Orden creada</p> : null}
    </form>
  );
}
