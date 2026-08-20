"use client";

import { useActionState } from "react";
import { createOrdenAction, type OrdenFormState, type TecnicoOption } from "@/app/actions/orden-actions";

const initialState: OrdenFormState = { error: null, success: false };

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

  return (
    <form action={formAction}>
      <label htmlFor="kilometrajeIngreso">Kilometraje de ingreso</label>
      <input id="kilometrajeIngreso" name="kilometrajeIngreso" type="number" min="0" />

      <label htmlFor="sintomas">Síntomas reportados</label>
      <textarea id="sintomas" name="sintomas" />

      <label htmlFor="mecanicoId">Mecánico asignado</label>
      <select id="mecanicoId" name="mecanicoId" defaultValue="">
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
