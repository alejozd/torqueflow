"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  actualizarDescuentoCotizacionAction,
  type DescuentoCotizacionFormState,
} from "@/app/actions/cotizacion-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const initialState: DescuentoCotizacionFormState = { error: null, success: false };

type TipoDescuento = "PORCENTAJE" | "MONTO";

/**
 * Descuento comercial por porcentaje o por monto fijo en pesos. Al cambiar de
 * tipo el campo muestra el último valor guardado de ese tipo.
 */
export function DescuentoCotizacionForm({
  cotizacionId,
  descuentoTipo,
  descuentoPct,
  descuentoMonto,
}: {
  cotizacionId: string;
  descuentoTipo: TipoDescuento;
  descuentoPct: number;
  descuentoMonto: number;
}) {
  const actualizarDescuento = actualizarDescuentoCotizacionAction.bind(null, cotizacionId);
  const [state, formAction, isPending] = useActionState(actualizarDescuento, initialState);
  const [tipo, setTipo] = useState<TipoDescuento>(descuentoTipo);

  useEffect(() => {
    if (state.success) {
      toast.success("Descuento aplicado");
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  const esPorcentaje = tipo === "PORCENTAJE";
  const valorGuardado = esPorcentaje ? descuentoPct : descuentoMonto;

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="descuentoTipo" value={tipo} />
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="descuento-valor" className="text-sm text-muted-foreground">
          Descuento comercial
        </label>
        <div role="group" aria-label="Tipo de descuento" className="flex rounded-md border border-border p-0.5">
          {(["PORCENTAJE", "MONTO"] as const).map((opcion) => (
            <button
              key={opcion}
              type="button"
              aria-pressed={tipo === opcion}
              aria-label={opcion === "PORCENTAJE" ? "Descuento por porcentaje" : "Descuento por monto fijo"}
              onClick={() => setTipo(opcion)}
              className={cn(
                "min-w-8 rounded px-2 py-0.5 text-xs font-semibold transition-colors",
                tipo === opcion ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {opcion === "PORCENTAJE" ? "%" : "$"}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          {!esPorcentaje ? (
            <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">$</span>
          ) : null}
          <Input
            key={`${tipo}-${valorGuardado}`}
            id="descuento-valor"
            name={esPorcentaje ? "descuentoPct" : "descuentoMonto"}
            type="number"
            inputMode="decimal"
            min="0"
            max={esPorcentaje ? "100" : undefined}
            step={esPorcentaje ? "0.01" : "1"}
            defaultValue={valorGuardado}
            className={cn("font-mono", esPorcentaje ? "pr-7" : "pl-6")}
          />
          {esPorcentaje ? (
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-muted-foreground">%</span>
          ) : null}
        </div>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Aplicando..." : "Aplicar"}
        </Button>
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
    </form>
  );
}
