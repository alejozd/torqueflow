"use client";

import { useActionState } from "react";
import { addEntradaItemAction, type EntradaFormState } from "@/app/actions/entrada-mercancia-actions";
import type { RepuestoOption } from "@/app/actions/repuesto-actions";

const initialState: EntradaFormState = { error: null, success: false };

export function AgregarEntradaItemForm({
  entradaId,
  repuestos,
}: {
  entradaId: string;
  repuestos: RepuestoOption[];
}) {
  const addItem = addEntradaItemAction.bind(null, entradaId);
  const [state, formAction, isPending] = useActionState(addItem, initialState);

  return (
    <form noValidate action={formAction}>
      <label htmlFor="repuestoId">Repuesto</label>
      <select id="repuestoId" name="repuestoId" defaultValue="" required>
        <option value="" disabled>
          Selecciona un repuesto
        </option>
        {repuestos.map((repuesto) => (
          <option key={repuesto.id} value={repuesto.id}>
            {repuesto.codigo} — {repuesto.nombre}
          </option>
        ))}
      </select>

      <label htmlFor="cantidad">Cantidad</label>
      <input id="cantidad" name="cantidad" type="number" min="1" required />

      <label htmlFor="precioCompraUnitario">Precio de compra unitario</label>
      <input id="precioCompraUnitario" name="precioCompraUnitario" type="number" min="0" step="0.01" required />

      <button type="submit" disabled={isPending}>
        {isPending ? "Registrando..." : "Registrar ítem"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Ítem registrado, stock actualizado</p> : null}
    </form>
  );
}
