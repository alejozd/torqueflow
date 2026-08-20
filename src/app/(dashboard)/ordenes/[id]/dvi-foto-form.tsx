"use client";

import { useActionState } from "react";
import { addDviFotoAction, type DviFormState } from "@/app/actions/dvi-actions";

const initialState: DviFormState = { error: null, success: false };

export function DviFotoForm({ ordenId }: { ordenId: string }) {
  const addFoto = addDviFotoAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(addFoto, initialState);

  return (
    <form noValidate action={formAction}>
      <label htmlFor="momento">Momento</label>
      <select id="momento" name="momento" defaultValue="ANTES">
        <option value="ANTES">Antes</option>
        <option value="DESPUES">Después</option>
      </select>

      <label htmlFor="foto">Foto</label>
      <input id="foto" name="foto" type="file" accept="image/jpeg,image/png,image/webp" required />

      <button type="submit" disabled={isPending}>
        {isPending ? "Subiendo..." : "Subir foto"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Foto subida</p> : null}
    </form>
  );
}
