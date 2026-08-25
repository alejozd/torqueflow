"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createCitaAction, type CitaFormState, type VehiculoOption } from "@/app/actions/cita-actions";
import { citaInputSchema } from "@/lib/validation/cita";

const initialState: CitaFormState = { error: null, success: false };

type CitaFormInput = z.input<typeof citaInputSchema>;
type CitaFormOutput = z.output<typeof citaInputSchema>;

export function NuevaCitaForm({ vehiculos }: { vehiculos: VehiculoOption[] }) {
  const [state, formAction, isPending] = useActionState(createCitaAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CitaFormInput, unknown, CitaFormOutput>({
    resolver: zodResolver(citaInputSchema),
    defaultValues: { vehiculoId: "", fechaHora: "", motivo: "", notas: "" },
  });

  if (vehiculos.length === 0) {
    return <p>Registra un cliente y su vehículo antes de agendar una cita.</p>;
  }

  return (
    <form
      noValidate
      ref={formRef}
      onSubmit={handleSubmit(() => startTransition(() => formAction(new FormData(formRef.current!))))}
    >
      <label htmlFor="vehiculoId">Vehículo</label>
      <select
        id="vehiculoId"
        required
        aria-invalid={errors.vehiculoId ? true : undefined}
        aria-describedby={errors.vehiculoId ? "vehiculoId-error" : undefined}
        {...register("vehiculoId")}
      >
        <option value="" disabled>
          Selecciona un vehículo
        </option>
        {vehiculos.map((vehiculo) => (
          <option key={vehiculo.id} value={vehiculo.id}>
            {`${vehiculo.placa} — ${vehiculo.marca} ${vehiculo.modelo} (${vehiculo.clienteNombre})`}
          </option>
        ))}
      </select>
      {errors.vehiculoId ? <p id="vehiculoId-error">{errors.vehiculoId.message}</p> : null}

      <label htmlFor="fechaHora">Fecha y hora</label>
      <input
        id="fechaHora"
        type="datetime-local"
        required
        aria-invalid={errors.fechaHora ? true : undefined}
        aria-describedby={errors.fechaHora ? "fechaHora-error" : undefined}
        {...register("fechaHora")}
      />
      {errors.fechaHora ? <p id="fechaHora-error">{errors.fechaHora.message}</p> : null}

      <label htmlFor="motivo">Motivo</label>
      <input
        id="motivo"
        required
        aria-invalid={errors.motivo ? true : undefined}
        aria-describedby={errors.motivo ? "motivo-error" : undefined}
        {...register("motivo")}
      />
      {errors.motivo ? <p id="motivo-error">{errors.motivo.message}</p> : null}

      <label htmlFor="notas">Notas</label>
      <textarea id="notas" {...register("notas")} />

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Agendar cita"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Cita agendada</p> : null}
    </form>
  );
}
