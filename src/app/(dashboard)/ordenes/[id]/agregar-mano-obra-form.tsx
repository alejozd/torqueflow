"use client";

import { useActionState } from "react";
import { addManoDeObraAction, type ManoDeObraFormState } from "@/app/actions/mano-de-obra-actions";

const initialState: ManoDeObraFormState = { error: null, success: false };

export function AgregarManoObraForm({ ordenId }: { ordenId: string }) {
  const addManoObra = addManoDeObraAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(addManoObra, initialState);

  return (
    <form noValidate action={formAction}>
      <label htmlFor="manoObraDescripcion">Descripción</label>
      <input id="manoObraDescripcion" name="descripcion" required />

      <label htmlFor="manoObraHoras">Horas</label>
      <input id="manoObraHoras" name="horas" type="number" min="0.1" step="0.1" required />

      <label htmlFor="manoObraPrecioHora">Precio por hora</label>
      <input id="manoObraPrecioHora" name="precioHora" type="number" min="0" step="0.01" required />

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Agregar mano de obra"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Mano de obra agregada</p> : null}
    </form>
  );
}
