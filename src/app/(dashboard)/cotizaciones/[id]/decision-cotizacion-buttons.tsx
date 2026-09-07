"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  aprobarCotizacionAction,
  rechazarCotizacionAction,
  type AprobarCotizacionFormState,
  type RechazarCotizacionFormState,
} from "@/app/actions/cotizacion-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const aprobarInitialState: AprobarCotizacionFormState = { error: null, success: false, ordenId: null };
const rechazarInitialState: RechazarCotizacionFormState = { error: null, success: false };

export function DecisionCotizacionButtons({ cotizacionId }: { cotizacionId: string }) {
  const router = useRouter();
  const [aprobarState, setAprobarState] = useState<AprobarCotizacionFormState>(aprobarInitialState);
  const [isAprobando, startAprobar] = useTransition();
  const [rechazarState, rechazarAction, isRechazando] = useActionState(
    rechazarCotizacionAction.bind(null, cotizacionId),
    rechazarInitialState,
  );

  function onAprobar() {
    startAprobar(async () => {
      const result = await aprobarCotizacionAction(cotizacionId, aprobarInitialState, new FormData());
      // Navigate from inside this same transition, not a useEffect: the
      // action's revalidatePath("/ordenes") can otherwise race a
      // state-driven effect -- same reasoning generar-factura-form.tsx documents.
      if (result.success && result.ordenId) {
        toast.success("Cotización aprobada");
        router.push(`/ordenes/${result.ordenId}`);
      } else {
        toast.error(result.error ?? "Error al aprobar la cotización");
        setAprobarState(result);
      }
    });
  }

  useEffect(() => {
    if (rechazarState.success) {
      toast.success("Cotización rechazada");
    } else if (rechazarState.error) {
      toast.error(rechazarState.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rechazarState]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Button type="button" onClick={onAprobar} disabled={isAprobando || isRechazando} className="flex-1">
          {isAprobando ? "Aprobando..." : "Aprobar"}
        </Button>
        <form action={rechazarAction} className="flex-1">
          <Button type="submit" variant="outline" disabled={isAprobando || isRechazando} className="w-full">
            {isRechazando ? "Rechazando..." : "Rechazar"}
          </Button>
        </form>
      </div>

      {aprobarState.error ? (
        <Alert variant="destructive">
          <AlertDescription>{aprobarState.error}</AlertDescription>
        </Alert>
      ) : null}
      {rechazarState.error ? (
        <Alert variant="destructive">
          <AlertDescription>{rechazarState.error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
