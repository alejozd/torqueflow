"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  actualizarDescuentoCotizacionAction,
  type DescuentoCotizacionFormState,
} from "@/app/actions/cotizacion-actions";
import { Button } from "@/components/ui/button";
import { CampoDescuento, type TipoDescuento } from "@/components/editor-descuento";

const initialState: DescuentoCotizacionFormState = { error: null, success: false };

/**
 * Descuento comercial por porcentaje o por monto fijo en pesos. Al cambiar de
 * tipo el campo muestra el último valor guardado de ese tipo. La UI %/$ es la
 * compartida con el mostrador (`components/editor-descuento.tsx`).
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
    <form action={formAction}>
      <input type="hidden" name="descuentoTipo" value={tipo} />
      <CampoDescuento
        tipo={tipo}
        onTipoChange={setTipo}
        campoKey={`${tipo}-${valorGuardado}`}
        campo={{ name: esPorcentaje ? "descuentoPct" : "descuentoMonto", defaultValue: valorGuardado }}
        accion={
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Aplicando..." : "Aplicar"}
          </Button>
        }
        pie={state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      />
    </form>
  );
}
