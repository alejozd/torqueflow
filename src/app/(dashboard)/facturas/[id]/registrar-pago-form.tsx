"use client";

import { useActionState } from "react";
import { registrarPagoAction, type PagoFormState } from "@/app/actions/pago-actions";
import type { EstadoFactura } from "@/generated/prisma-tenant";

const initialState: PagoFormState = { error: null, success: false };

export function RegistrarPagoForm({ facturaId, estado }: { facturaId: string; estado: EstadoFactura }) {
  const registrarPago = registrarPagoAction.bind(null, facturaId);
  const [state, formAction, isPending] = useActionState(registrarPago, initialState);

  if (estado === "PAGADA") {
    return <p role="status">Factura pagada</p>;
  }

  return (
    <form noValidate action={formAction}>
      <label htmlFor="monto">Monto</label>
      <input id="monto" name="monto" type="number" min="0.01" step="0.01" required />

      <label htmlFor="metodoPago">Método de pago</label>
      <select id="metodoPago" name="metodoPago" defaultValue="EFECTIVO">
        <option value="EFECTIVO">Efectivo</option>
        <option value="TARJETA">Tarjeta</option>
        <option value="TRANSFERENCIA">Transferencia</option>
        <option value="OTRO">Otro</option>
      </select>

      <label htmlFor="referencia">Referencia (opcional)</label>
      <input id="referencia" name="referencia" />

      <button type="submit" disabled={isPending}>
        {isPending ? "Registrando..." : "Registrar pago"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Pago registrado</p> : null}
    </form>
  );
}
