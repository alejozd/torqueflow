"use client";

import { useActionState } from "react";
import { cambiarEstadoCitaAction, type CitaFormState } from "@/app/actions/cita-actions";
import type { EstadoCita } from "@/generated/prisma-tenant";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const initialState: CitaFormState = { error: null, success: false };

const ESTADOS: EstadoCita[] = ["PROGRAMADA", "CONFIRMADA", "CANCELADA", "COMPLETADA"];

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
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="estado">Estado</Label>
        {/*
          Native <select>, not shadcn's Select (Base UI, no DOM <option>s
          while closed) -- getByRole("option") in the existing tests needs
          real <select>/<option> elements. Styled by hand to match the
          shadcn select trigger look (see seleccionar-sede-form.tsx).
        */}
        <select
          id="estado"
          name="estado"
          defaultValue={estadoActual}
          className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
        >
          {ESTADOS.map((estado) => (
            <option key={estado} value={estado}>
              {estado}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" disabled={isPending}>
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
