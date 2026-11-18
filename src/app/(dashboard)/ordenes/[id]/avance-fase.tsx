"use client";

import { startTransition, useActionState, useState, useTransition } from "react";
import { ArrowRight, Ban, MoreHorizontal } from "lucide-react";
import {
  avisarClienteEstadoOrdenAction,
  updateEstadoOrdenAction,
  type AvisoClienteState,
  type EstadoFormState,
} from "@/app/actions/orden-actions";
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
import { esEstadoNotificable } from "@/lib/notificaciones/plantilla";
import type { EstadoOrden } from "@/generated/prisma-tenant";

const initialState: EstadoFormState = { error: null, advertencia: null };

/** Cómo se nombra cada estado en la pregunta de avisar al cliente. */
const ESTADO_EN_EL_AVISO: Partial<Record<EstadoOrden, string>> = {
  EN_PROCESO: "en proceso",
  TERMINADA: "lista para entregar",
  ANULADA: "anulada",
};

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
 *
 * Tras un cambio que vale la pena contarle al cliente se pregunta si avisarle por
 * correo (tanda 4): no sale solo, para no llenarlo de correos, y si se envía va
 * en segundo plano. Sin correo del cliente no se pregunta.
 */
export function AvanceFase({
  ordenId,
  estado,
  puedeAnular,
  clienteNombre,
  clienteEmail,
}: {
  ordenId: string;
  estado: EstadoOrden;
  clienteNombre: string;
  clienteEmail: string | null;
  /** Sin `ordenes.anular` (el técnico) no se ofrece «Anular orden». Obligatoria: olvidarla no la deja abierta. */
  puedeAnular: boolean;
}) {
  const cambiar = updateEstadoOrdenAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(cambiar, initialState);
  const [anulando, setAnulando] = useState(false);
  // El resultado de cambio ya respondido (se envió o se dijo que no): no se vuelve a preguntar.
  const [respondido, setRespondido] = useState<EstadoFormState | null>(null);
  const [aviso, setAviso] = useState<AvisoClienteState | null>(null);
  const [enviandoAviso, iniciarAviso] = useTransition();
  const estadoNuevo = state.estadoNuevo;
  const preguntarAviso =
    state !== respondido && !!estadoNuevo && esEstadoNotificable(estadoNuevo) && !!clienteEmail;
  const siguiente = SIGUIENTE[estado];
  const anulable = puedeAnular && ESTADO_ORDEN_TRANSITIONS[estado].includes("ANULADA");

  function avisarCliente() {
    iniciarAviso(async () => {
      setAviso(await avisarClienteEstadoOrdenAction(ordenId));
      setRespondido(state);
    });
  }

  function enviar(destino: EstadoOrden) {
    setAviso(null);
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
      {preguntarAviso ? (
        <ConfirmacionEnLinea
          pregunta={`¿Avisar a ${clienteNombre} por correo que la orden está ${ESTADO_EN_EL_AVISO[estadoNuevo] ?? "actualizada"}?`}
          etiquetaConfirmar="Enviar correo"
          destructiva={false}
          pendiente={enviandoAviso}
          onCancelar={() => setRespondido(state)}
          onConfirmar={avisarCliente}
        />
      ) : null}
      {aviso?.mensaje ? (
        <p role="status" className="text-xs text-muted-foreground">
          {aviso.mensaje}
        </p>
      ) : null}
      {aviso?.error ? <p className="text-xs text-destructive">{aviso.error}</p> : null}
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
