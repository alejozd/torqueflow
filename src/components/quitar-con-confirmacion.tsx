"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import type { ResultadoAccion } from "@/lib/resultado-accion";
import { ConfirmacionEnLinea } from "@/components/confirmacion-en-linea";
import { Button } from "@/components/ui/button";

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
}: {
  etiqueta: string;
  pregunta: string;
  accion: () => Promise<ResultadoAccion>;
  onQuitado?: () => void;
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
    return (
      <ConfirmacionEnLinea
        pregunta={pregunta}
        etiquetaConfirmar={pendiente ? "Quitando..." : "Sí, quitar"}
        pendiente={pendiente}
        onConfirmar={quitar}
        onCancelar={() => setConfirmando(false)}
      />
    );
  }

  return (
    <Button type="button" variant="ghost" size="sm" aria-label={etiqueta} onClick={() => setConfirmando(true)}>
      <X className="size-4" />
    </Button>
  );
}
