"use client";

import { useActionState } from "react";
import { reenviarAlClienteAction, type EnvioFeState } from "@/app/actions/factura-electronica-actions";
import { Button } from "@/components/ui/button";

const inicial: EnvioFeState = { error: null, success: false, mensaje: null, errores: [] };

/** Copia del XML y el PDF al correo del cliente; sin correo registrado, solo el aviso. */
export function ReenviarAlCliente({
  facturaId,
  documentoId,
  correoCliente,
}: {
  facturaId: string;
  documentoId: string;
  correoCliente: string | null;
}) {
  const [state, formAction, pendiente] = useActionState(reenviarAlClienteAction.bind(null, facturaId, documentoId), inicial);

  if (!correoCliente?.trim()) {
    return <p className="text-muted-foreground">El cliente no tiene correo registrado.</p>;
  }
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Button type="submit" variant="outline" size="sm" className="self-start" disabled={pendiente}>
        Reenviar al cliente
      </Button>
      {state.error ? <p className="text-destructive">{state.error}</p> : null}
      {state.success && state.mensaje ? <p>{state.mensaje}</p> : null}
    </form>
  );
}
