"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { crearFacturaAction, type FacturaFormState } from "@/app/actions/factura-actions";

const initialState: FacturaFormState = { error: null, success: false, facturaId: null };

export function GenerarFacturaForm({ ordenId }: { ordenId: string }) {
  const router = useRouter();
  const crearFactura = crearFacturaAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(crearFactura, initialState);

  useEffect(() => {
    if (state.success && state.facturaId) {
      router.push(`/facturas/${state.facturaId}`);
    }
  }, [state.success, state.facturaId, router]);

  return (
    <form noValidate action={formAction}>
      <label htmlFor="descuento">Descuento</label>
      <input id="descuento" name="descuento" type="number" min="0" step="0.01" defaultValue="0" />

      <button type="submit" disabled={isPending}>
        {isPending ? "Generando..." : "Generar factura"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
    </form>
  );
}
