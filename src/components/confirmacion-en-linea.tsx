"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

/**
 * In-page "¿Seguro?" strip (never window.confirm) shared by every action
 * that is hard to undo. With `enviaFormulario` the confirm button is the
 * enclosing form's submit button, so the caller's form action runs on it.
 */
export function ConfirmacionEnLinea({
  pregunta,
  etiquetaConfirmar,
  onCancelar,
  onConfirmar,
  pendiente = false,
  enviaFormulario = false,
  destructiva = true,
}: {
  pregunta: string;
  etiquetaConfirmar: string;
  onCancelar: () => void;
  onConfirmar?: () => void;
  pendiente?: boolean;
  enviaFormulario?: boolean;
  destructiva?: boolean;
}) {
  // The trigger button unmounts when this strip appears, so focus would fall
  // to <body>; park it on the safe choice ("No") instead.
  const cancelarRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelarRef.current?.focus();
  }, []);

  return (
    <div role="group" aria-label={pregunta} className="flex flex-wrap items-center gap-2 text-sm">
      <span>{pregunta}</span>
      <Button
        type={enviaFormulario ? "submit" : "button"}
        variant={destructiva ? "destructive" : "default"}
        size="sm"
        disabled={pendiente}
        onClick={onConfirmar}
      >
        {etiquetaConfirmar}
      </Button>
      <Button ref={cancelarRef} type="button" variant="ghost" size="sm" disabled={pendiente} onClick={onCancelar}>
        No
      </Button>
    </div>
  );
}
