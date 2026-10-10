"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import {
  guardarDiasAvisoAction,
  type ConfiguracionTallerFormState,
} from "@/app/actions/configuracion-taller-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ConfiguracionTallerFormState = { error: null, success: false };

export function RecordatoriosForm({ diasAviso }: { diasAviso: number }) {
  const [state, formAction, isPending] = useActionState(guardarDiasAvisoAction, initialState);

  useEffect(() => {
    if (state.success) toast.success("Configuración guardada");
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="diasAvisoVencimiento">Días de anticipación para avisos de vencimiento</Label>
        <Input
          id="diasAvisoVencimiento"
          name="diasAvisoVencimiento"
          type="number"
          min={1}
          max={90}
          required
          defaultValue={diasAviso}
          className="max-w-32 font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Se avisa al cliente cuando su SOAT o tecnomecánica vence dentro de este plazo.
        </p>
        {state.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
      </div>
      <div>
        <Button type="submit" disabled={isPending}>
          Guardar
        </Button>
      </div>
    </form>
  );
}
