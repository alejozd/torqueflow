"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearFacturaAction, type FacturaFormState } from "@/app/actions/factura-actions";

const initialState: FacturaFormState = { error: null, success: false, facturaId: null };

export function GenerarFacturaForm({ ordenId }: { ordenId: string }) {
  const router = useRouter();
  const [state, setState] = useState<FacturaFormState>(initialState);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await crearFacturaAction(ordenId, initialState, formData);
      // Navigate from inside this same transition, not a useEffect: crearFacturaAction's
      // revalidatePath(`/ordenes/${ordenId}`) makes this form's own parent swap it out for
      // a "Ver factura" link once orden.factura is populated, which can unmount this
      // component before a state-driven effect gets a chance to run router.push.
      if (result.success && result.facturaId) {
        router.push(`/facturas/${result.facturaId}`);
      } else {
        setState(result);
      }
    });
  }

  return (
    <form noValidate action={handleSubmit}>
      <label htmlFor="descuento">Descuento</label>
      <input id="descuento" name="descuento" type="number" min="0" step="0.01" defaultValue="0" />

      <button type="submit" disabled={isPending}>
        {isPending ? "Generando..." : "Generar factura"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
    </form>
  );
}
