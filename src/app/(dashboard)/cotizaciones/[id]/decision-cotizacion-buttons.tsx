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
import { ConfirmacionEnLinea } from "@/components/confirmacion-en-linea";

const aprobarInitialState: AprobarCotizacionFormState = { error: null, success: false, ordenId: null };
const rechazarInitialState: RechazarCotizacionFormState = { error: null, success: false };

export function DecisionCotizacionButtons({ cotizacionId }: { cotizacionId: string }) {
  const router = useRouter();
  const [aprobarState, setAprobarState] = useState<AprobarCotizacionFormState>(aprobarInitialState);
  const [confirmando, setConfirmando] = useState<"aprobar" | "rechazar" | null>(null);
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
        setConfirmando(null);
      }
    });
  }

  useEffect(() => {
    setConfirmando(null);
    if (rechazarState.success) {
      toast.success("Cotización rechazada");
    } else if (rechazarState.error) {
      toast.error(rechazarState.error);
    }
  }, [rechazarState]);

  return (
    <div className="flex flex-col gap-3">
      {confirmando === "aprobar" ? (
        <ConfirmacionEnLinea
          pregunta="¿Aprobar la cotización? Se creará una orden de trabajo con sus ítems."
          etiquetaConfirmar={isAprobando ? "Aprobando..." : "Sí, aprobar"}
          destructiva={false}
          pendiente={isAprobando}
          onConfirmar={onAprobar}
          onCancelar={() => setConfirmando(null)}
        />
      ) : confirmando === "rechazar" ? (
        <form action={rechazarAction}>
          <ConfirmacionEnLinea
            pregunta="¿Rechazar la cotización?"
            etiquetaConfirmar={isRechazando ? "Rechazando..." : "Sí, rechazar"}
            enviaFormulario
            pendiente={isRechazando}
            onCancelar={() => setConfirmando(null)}
          />
        </form>
      ) : (
        <div className="flex gap-2">
          <Button type="button" onClick={() => setConfirmando("aprobar")} disabled={isAprobando || isRechazando} className="flex-1">
            Aprobar
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmando("rechazar")}
            disabled={isAprobando || isRechazando}
            className="flex-1"
          >
            Rechazar
          </Button>
        </div>
      )}

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
