"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Two-step delete (button, then an in-page "¿Seguro?" confirmation -- never
 * window.confirm) for records whose server action may refuse, e.g. a
 * cliente or vehículo with history. The refusal reason is shown inline;
 * `onEliminado` runs only after the server confirmed the delete.
 */
export function EliminarConConfirmacion({
  etiqueta,
  confirmacion,
  accion,
  onEliminado,
}: {
  etiqueta: string;
  confirmacion: string;
  accion: () => Promise<{ error: string | null; success: boolean }>;
  onEliminado?: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function eliminar() {
    startTransition(async () => {
      const resultado = await accion();
      if (resultado.error) {
        setError(resultado.error);
        setConfirmando(false);
        return;
      }
      onEliminado?.();
    });
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      {confirmando ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>{confirmacion}</span>
          <Button type="button" variant="destructive" size="sm" disabled={pendiente} onClick={eliminar}>
            {pendiente ? "Eliminando..." : "Sí, eliminar"}
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={pendiente} onClick={() => setConfirmando(false)}>
            No
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          className="w-fit text-destructive hover:text-destructive"
          onClick={() => {
            setError(null);
            setConfirmando(true);
          }}
        >
          <Trash2 />
          {etiqueta}
        </Button>
      )}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
