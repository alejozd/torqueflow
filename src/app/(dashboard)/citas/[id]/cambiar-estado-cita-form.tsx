"use client";

import { useActionState } from "react";
import { cambiarEstadoCitaAction, type CitaFormState } from "@/app/actions/cita-actions";
import type { EstadoCita } from "@/generated/prisma-tenant";

const initialState: CitaFormState = { error: null, success: false };

const ESTADOS: EstadoCita[] = ["PROGRAMADA", "CONFIRMADA", "CANCELADA", "COMPLETADA"];

export function CambiarEstadoCitaForm({
  citaId,
  estadoActual,
}: {
  citaId: string;
  estadoActual: EstadoCita;
}) {
  const [state, formAction, isPending] = useActionState(
    cambiarEstadoCitaAction.bind(null, citaId),
    initialState,
  );

  return (
    <form noValidate action={formAction}>
      <label htmlFor="estado">Estado</label>
      <select id="estado" name="estado" defaultValue={estadoActual}>
        {ESTADOS.map((estado) => (
          <option key={estado} value={estado}>
            {estado}
          </option>
        ))}
      </select>

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Actualizar estado"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Estado actualizado</p> : null}
    </form>
  );
}
