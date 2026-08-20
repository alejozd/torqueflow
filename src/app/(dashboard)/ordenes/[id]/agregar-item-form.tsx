"use client";

import { useActionState } from "react";
import { addItemOrdenAction, type ItemOrdenFormState } from "@/app/actions/item-orden-actions";
import type { Repuesto } from "@/generated/prisma-tenant";

const initialState: ItemOrdenFormState = { error: null, success: false };

export function AgregarItemForm({ ordenId, repuestos }: { ordenId: string; repuestos: Repuesto[] }) {
  const addItem = addItemOrdenAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(addItem, initialState);

  return (
    <form noValidate action={formAction}>
      <label htmlFor="repuestoId">Repuesto del inventario (opcional)</label>
      <select id="repuestoId" name="repuestoId" defaultValue="">
        <option value="">Ítem manual (completa descripción y precio abajo)</option>
        {repuestos.map((repuesto) => (
          <option key={repuesto.id} value={repuesto.id}>
            {repuesto.codigo} — {repuesto.nombre}
          </option>
        ))}
      </select>

      <label htmlFor="itemDescripcion">Descripción</label>
      <input id="itemDescripcion" name="descripcion" />

      <label htmlFor="itemCantidad">Cantidad</label>
      <input id="itemCantidad" name="cantidad" type="number" min="1" required />

      <label htmlFor="itemPrecioUnitario">Precio unitario</label>
      <input id="itemPrecioUnitario" name="precioUnitario" type="number" min="0" step="0.01" />

      <p>Si seleccionas un repuesto del inventario, la descripción y el precio se completan automáticamente.</p>

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Agregar ítem"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Ítem agregado</p> : null}
    </form>
  );
}
