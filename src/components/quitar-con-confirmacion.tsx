"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import type { ResultadoAccion } from "@/lib/resultado-accion";
import { ConfirmacionEnLinea } from "@/components/confirmacion-en-linea";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Row-sized remove control (✕, then "¿Quitar …? Sí / No") for table rows
 * such as an orden's ítems. The refusal goes to a toast: a row has no room
 * for an inline alert. The server action's revalidatePath refreshes the list.
 */
export function QuitarConConfirmacion({
  etiqueta,
  pregunta,
  accion,
  onQuitado,
  flotante = false,
}: {
  etiqueta: string;
  pregunta: string;
  accion: () => Promise<ResultadoAccion>;
  onQuitado?: () => void;
  /**
   * La pregunta flota sobre la fila, pegada a la derecha, en vez de ocupar la
   * celda: en columnas angostas (tabla de conceptos) se partía en varias líneas.
   * La celda que lo contiene debe ser `relative`.
   */
  flotante?: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [pendiente, startTransition] = useTransition();

  function quitar() {
    startTransition(async () => {
      let resultado: ResultadoAccion;
      try {
        resultado = await accion();
      } catch {
        setConfirmando(false);
        toast.error("No se pudo quitar. Intenta de nuevo.");
        return;
      }
      setConfirmando(false);
      if (resultado.error) {
        toast.error(resultado.error);
        return;
      }
      onQuitado?.();
    });
  }

  if (confirmando) {
    const confirmacion = (
      <ConfirmacionEnLinea
        pregunta={pregunta}
        etiquetaConfirmar={pendiente ? "Quitando..." : "Sí, quitar"}
        pendiente={pendiente}
        onConfirmar={quitar}
        onCancelar={() => setConfirmando(false)}
      />
    );
    if (!flotante) return confirmacion;
    return (
      <div className="absolute top-1/2 right-1 z-10 w-max -translate-y-1/2 rounded-lg border border-border bg-popover py-1 pr-1 pl-3 text-popover-foreground shadow-md [&_[role=group]]:flex-nowrap">
        {confirmacion}
      </div>
    );
  }

  // Un ✕ solo no dice qué quita: el tooltip lo nombra al pasar el mouse o al llegar con Tab.
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button type="button" variant="ghost" size="sm" aria-label={etiqueta} onClick={() => setConfirmando(true)}>
            <X className="size-4" />
          </Button>
        }
      />
      <TooltipContent>{etiqueta}</TooltipContent>
    </Tooltip>
  );
}
