"use client";

import { useActionState } from "react";
import { cambiarEstadoCitaAction, type CitaFormState } from "@/app/actions/cita-actions";
import type { EstadoCita } from "@/generated/prisma-tenant";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const initialState: CitaFormState = { error: null, success: false };

const ESTADOS: EstadoCita[] = ["PROGRAMADA", "CONFIRMADA", "CANCELADA", "COMPLETADA"];

// Same tones as citas/page.tsx's ESTADO_BADGE_CLASSNAME, applied to a dot
// instead of a badge background.
const ESTADO_META: Record<EstadoCita, { label: string; dot: string }> = {
  PROGRAMADA: { label: "Programada", dot: "bg-muted-foreground" },
  CONFIRMADA: { label: "Confirmada", dot: "bg-[oklch(0.44_0.12_250)]" },
  CANCELADA: { label: "Cancelada", dot: "bg-[oklch(0.5_0.2_27)]" },
  COMPLETADA: { label: "Completada", dot: "bg-[oklch(0.4_0.1_150)]" },
};

export function CambiarEstadoCitaForm({
  citaId,
  estadoActual,
}: {
  citaId: string;
  estadoActual: EstadoCita;
}) {
  const [state, formAction, isPending] = useActionState(
    cambiarEstadoCitaAction.bind(null, citaId),
    initialState,
  );

  return (
    <form noValidate action={formAction} className="flex flex-col gap-4">
      {/*
        Radio list, not a <select>: no transition table restricts which
        estados are pickable (cambiarEstadoCitaAction's own comment -- an
        appointment can legitimately move back from CONFIRMADA to
        PROGRAMADA), so every option stays visible and comparable at once.
        There is no per-estado change history in the schema (only the
        current `estado` plus a generic, all-fields `updatedAt`), so this
        only marks the current value -- it does not claim to show a log.
      */}
      <fieldset className="flex flex-col gap-1.5">
        <legend className="sr-only">Estado</legend>
        {ESTADOS.map((estado) => (
          <div
            key={estado}
            className={cn(
              "flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-sm transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5",
            )}
          >
            <label className="flex flex-1 cursor-pointer items-center gap-2.5">
              <input
                type="radio"
                name="estado"
                value={estado}
                defaultChecked={estado === estadoActual}
                className="sr-only"
              />
              <span className={cn("size-2 shrink-0 rounded-full", ESTADO_META[estado].dot)} />
              <span>{ESTADO_META[estado].label}</span>
            </label>
            {estado === estadoActual ? <span className="text-xs text-muted-foreground">Actual</span> : null}
          </div>
        ))}
      </fieldset>

      <Button type="submit" disabled={isPending} className="self-end">
        {isPending ? "Guardando..." : "Actualizar estado"}
      </Button>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {/* Alert hardcodes role="alert"; a status message must keep role="status" natively. */}
      {state.success ? <p role="status">Estado actualizado</p> : null}
    </form>
  );
}
