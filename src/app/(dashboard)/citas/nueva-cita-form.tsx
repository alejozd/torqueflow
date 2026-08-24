"use client";

import { useActionState } from "react";
import { createCitaAction, type CitaFormState, type VehiculoOption } from "@/app/actions/cita-actions";

const initialState: CitaFormState = { error: null, success: false };

export function NuevaCitaForm({ vehiculos }: { vehiculos: VehiculoOption[] }) {
  const [state, formAction, isPending] = useActionState(createCitaAction, initialState);

  if (vehiculos.length === 0) {
    return <p>Registra un cliente y su vehículo antes de agendar una cita.</p>;
  }

  return (
    <form noValidate action={formAction}>
      <label htmlFor="vehiculoId">Vehículo</label>
      <select id="vehiculoId" name="vehiculoId" required defaultValue="">
        <option value="" disabled>
          Selecciona un vehículo
        </option>
        {vehiculos.map((vehiculo) => (
          <option key={vehiculo.id} value={vehiculo.id}>
            {`${vehiculo.placa} — ${vehiculo.marca} ${vehiculo.modelo} (${vehiculo.clienteNombre})`}
          </option>
        ))}
      </select>

      <label htmlFor="fechaHora">Fecha y hora</label>
      <input id="fechaHora" name="fechaHora" type="datetime-local" required />

      <label htmlFor="motivo">Motivo</label>
      <input id="motivo" name="motivo" required />

      <label htmlFor="notas">Notas</label>
      <textarea id="notas" name="notas" />

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Agendar cita"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Cita agendada</p> : null}
    </form>
  );
}
