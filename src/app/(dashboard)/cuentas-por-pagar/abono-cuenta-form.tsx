"use client";

import { useState, useActionState } from "react";
import { abonarCuentaPorPagarAction, type AbonoFormState } from "@/app/actions/cuenta-por-pagar-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";

const initialState: AbonoFormState = { error: null, success: false };

/** Abono a una cuenta por pagar. Con el saldo precargado, el botón salda la cuenta de una vez. */
export function AbonoCuentaForm({ cuentaId, saldo }: { cuentaId: string; saldo: number }) {
  const abonar = abonarCuentaPorPagarAction.bind(null, cuentaId);
  const [state, formAction, isPending] = useActionState(abonar, initialState);
  const [metodoPago, setMetodoPago] = useState("TRANSFERENCIA");

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <Input
        aria-label="Monto del abono"
        name="monto"
        type="number"
        min="0.01"
        step="0.01"
        defaultValue={saldo}
        className="w-32 font-mono"
      />
      <SelectField
        id={`metodo-abono-${cuentaId}`}
        value={metodoPago}
        onValueChange={setMetodoPago}
        items={[
          { value: "EFECTIVO", label: "Efectivo" },
          { value: "TRANSFERENCIA", label: "Transferencia" },
          { value: "TARJETA", label: "Tarjeta" },
          { value: "OTRO", label: "Otro" },
        ]}
      />
      <input type="hidden" name="metodoPago" value={metodoPago} />
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "Abonando..." : "Abonar"}
      </Button>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? (
        <p role="status" className="text-sm text-muted-foreground">
          Abono registrado
        </p>
      ) : null}
    </form>
  );
}
