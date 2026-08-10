"use client";

import { useActionState } from "react";
import { addHistorialEntryAction, type HistorialFormState } from "@/app/actions/historial-actions";

const initialState: HistorialFormState = { error: null, success: false };

export function NuevaEntradaForm({ vehiculoId }: { vehiculoId: string }) {
  const addEntryForVehiculo = addHistorialEntryAction.bind(null, vehiculoId);
  const [state, formAction, isPending] = useActionState(addEntryForVehiculo, initialState);

  return (
    <form action={formAction}>
      <label htmlFor="descripcion">Descripción</label>
      <textarea id="descripcion" name="descripcion" required />

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Registrar"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Entrada registrada</p> : null}
    </form>
  );
}
