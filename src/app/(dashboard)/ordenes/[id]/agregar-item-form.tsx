"use client";

import { useActionState } from "react";
import { addItemOrdenAction, type ItemOrdenFormState } from "@/app/actions/item-orden-actions";

const initialState: ItemOrdenFormState = { error: null, success: false };

export function AgregarItemForm({ ordenId }: { ordenId: string }) {
  const addItem = addItemOrdenAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(addItem, initialState);

  return (
    <form noValidate action={formAction}>
      <label htmlFor="itemDescripcion">Descripción</label>
      <input id="itemDescripcion" name="descripcion" required />

      <label htmlFor="itemCantidad">Cantidad</label>
      <input id="itemCantidad" name="cantidad" type="number" min="1" required />

      <label htmlFor="itemPrecioUnitario">Precio unitario</label>
      <input id="itemPrecioUnitario" name="precioUnitario" type="number" min="0" step="0.01" required />

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Agregar ítem"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Ítem agregado</p> : null}
    </form>
  );
}
