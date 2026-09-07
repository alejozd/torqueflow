"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import {
  actualizarDescuentoCotizacionAction,
  type DescuentoCotizacionFormState,
} from "@/app/actions/cotizacion-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: DescuentoCotizacionFormState = { error: null, success: false };

export function DescuentoCotizacionForm({ cotizacionId, descuentoPct }: { cotizacionId: string; descuentoPct: number }) {
  const actualizarDescuento = actualizarDescuentoCotizacionAction.bind(null, cotizacionId);
  const [state, formAction, isPending] = useActionState(actualizarDescuento, initialState);

  useEffect(() => {
    if (state.success) {
      toast.success("Descuento aplicado");
    } else if (state.error) {
      toast.error(state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <Label htmlFor="descuentoPct">Descuento (%)</Label>
      <div className="flex items-center gap-2">
        <Input
          key={descuentoPct}
          id="descuentoPct"
          name="descuentoPct"
          type="number"
          min="0"
          max="100"
          step="0.01"
          defaultValue={descuentoPct}
          className="w-24 font-mono"
        />
        <Button type="submit" variant="outline" size="sm" disabled={isPending}>
          {isPending ? "Guardando..." : "Aplicar"}
        </Button>
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
    </form>
  );
}
