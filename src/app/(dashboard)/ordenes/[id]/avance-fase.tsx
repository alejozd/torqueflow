"use client";

import { startTransition, useActionState, useState } from "react";
import { ArrowRight, Ban, MoreHorizontal } from "lucide-react";
import { updateEstadoOrdenAction, type EstadoFormState } from "@/app/actions/orden-actions";
import { ConfirmacionEnLinea } from "@/components/confirmacion-en-linea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ESTADO_ORDEN_TRANSITIONS } from "@/lib/orden/estado-transitions";
import type { EstadoOrden } from "@/generated/prisma-tenant";

const initialState: EstadoFormState = { error: null, advertencia: null };

const SIGUIENTE: Partial<Record<EstadoOrden, { destino: EstadoOrden; etiqueta: string; detalle: string }>> = {
  BORRADOR: { destino: "EN_PROCESO", etiqueta: "Pasar a En proceso", detalle: "Siguiente paso: empezar el trabajo" },
  EN_PROCESO: {
    destino: "TERMINADA",
    etiqueta: "Marcar como terminada",
    detalle: "Siguiente paso: dejarla lista para entregar",
  },
};

/**
 * El único botón grande de la ficha: lleva la orden a su siguiente paso. Entregar
 * no se hace aquí (exige el acta), solo se lleva al acta. Anular vive en «⋯» y
 * siempre pregunta, porque deja la orden sin poder editarse.
 */
export function AvanceFase({ ordenId, estado }: { ordenId: string; estado: EstadoOrden }) {
  const cambiar = updateEstadoOrdenAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(cambiar, initialState);
  const [anulando, setAnulando] = useState(false);
  const siguiente = SIGUIENTE[estado];
  const anulable = ESTADO_ORDEN_TRANSITIONS[estado].includes("ANULADA");

  function enviar(destino: EstadoOrden) {
    const formData = new FormData();
    formData.set("estado", destino);
    startTransition(() => formAction(formData));
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-1.5">
        {anulable ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button type="button" variant="ghost" size="icon" aria-label="Más acciones" disabled={isPending} />}
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem variant="destructive" onClick={() => setAnulando(true)}>
                  <Ban className="size-3.5" />
                  Anular orden…
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {siguiente ? (
          <Button type="button" disabled={isPending} onClick={() => enviar(siguiente.destino)}>
            {isPending ? "Guardando..." : siguiente.etiqueta}
            <ArrowRight className="size-4" />
          </Button>
        ) : estado === "TERMINADA" ? (
          <a href="?tab=entrega" className={buttonVariants()}>
            Ir a la entrega
            <ArrowRight className="size-4" />
          </a>
        ) : null}
      </div>
      {siguiente ? (
        <p className="text-xs text-muted-foreground">{siguiente.detalle}</p>
      ) : estado === "TERMINADA" ? (
        <p className="text-xs text-muted-foreground">Falta el acta firmada</p>
      ) : null}
      {anulando ? (
        <ConfirmacionEnLinea
          pregunta="¿Anular la orden? Ya no se podrá editar."
          etiquetaConfirmar="Sí, anular"
          pendiente={isPending}
          onCancelar={() => setAnulando(false)}
          onConfirmar={() => {
            setAnulando(false);
            enviar("ANULADA");
          }}
        />
      ) : null}
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {/* Alert hardcodes role="alert"; a status message must keep role="status" natively. */}
      {state.advertencia ? (
        <p role="status" className="text-xs text-muted-foreground">
          {state.advertencia}
        </p>
      ) : null}
    </div>
  );
}
