"use client";

import { useActionState } from "react";
import { createVehiculoAction, type VehiculoFormState } from "@/app/actions/vehiculo-actions";

const initialState: VehiculoFormState = { error: null, success: false };

export function NuevoVehiculoForm({ clienteId }: { clienteId: string }) {
  const createVehiculoForCliente = createVehiculoAction.bind(null, clienteId);
  const [state, formAction, isPending] = useActionState(createVehiculoForCliente, initialState);

  return (
    <form action={formAction}>
      <label htmlFor="placa">Placa</label>
      <input id="placa" name="placa" required />

      <label htmlFor="marca">Marca</label>
      <input id="marca" name="marca" required />

      <label htmlFor="modelo">Modelo</label>
      <input id="modelo" name="modelo" required />

      <label htmlFor="anio">Año</label>
      <input id="anio" name="anio" type="number" min="1900" max="2100" />

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Agregar vehículo"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Vehículo agregado</p> : null}
    </form>
  );
}
