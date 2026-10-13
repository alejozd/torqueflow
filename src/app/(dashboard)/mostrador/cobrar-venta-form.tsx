"use client";

import { useActionState } from "react";
import { cobrarVentaMostradorAction, type VentaMostradorFormState } from "@/app/actions/venta-mostrador-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { useState } from "react";

const initialState: VentaMostradorFormState = { error: null, success: false };

/** Cobro de una venta que quedó a crédito. */
export function CobrarVentaForm({ ventaId, saldo }: { ventaId: string; saldo: number }) {
  const cobrar = cobrarVentaMostradorAction.bind(null, ventaId);
  const [state, formAction, isPending] = useActionState(cobrar, initialState);
  const [metodoPago, setMetodoPago] = useState("EFECTIVO");

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`monto-${ventaId}`}>Monto</Label>
        <Input
          id={`monto-${ventaId}`}
          name="monto"
          type="number"
          min="0.01"
          step="0.01"
          defaultValue={saldo}
          className="w-32 font-mono"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`metodo-${ventaId}`}>Método</Label>
        <SelectField
          id={`metodo-${ventaId}`}
          value={metodoPago}
          onValueChange={setMetodoPago}
          items={[
            { value: "EFECTIVO", label: "Efectivo" },
            { value: "TARJETA", label: "Tarjeta" },
            { value: "TRANSFERENCIA", label: "Transferencia" },
            { value: "OTRO", label: "Otro" },
          ]}
        />
        <input type="hidden" name="metodoPago" value={metodoPago} />
      </div>
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "Cobrando..." : "Cobrar"}
      </Button>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? (
        <p role="status" className="text-sm text-muted-foreground">
          Cobro registrado
        </p>
      ) : null}
    </form>
  );
}
