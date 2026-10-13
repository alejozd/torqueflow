"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { guardarDiasEstancadaAction, type ConfiguracionTallerFormState } from "@/app/actions/configuracion-taller-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ConfiguracionTallerFormState = { error: null, success: false };

/** Fase 22: cuántos días sin actividad hacen que una orden se marque estancada. */
export function EstancadasForm({ diasEstancada }: { diasEstancada: number }) {
  const [state, formAction, isPending] = useActionState(guardarDiasEstancadaAction, initialState);

  useEffect(() => {
    if (state.success) toast.success("Configuración guardada");
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="diasOrdenEstancada">Días sin actividad para marcar una orden como estancada</Label>
        <Input
          id="diasOrdenEstancada"
          name="diasOrdenEstancada"
          type="number"
          min={1}
          max={90}
          required
          defaultValue={diasEstancada}
          className="max-w-32 font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Se cuentan los días desde el último movimiento de la orden o de lo que se le haya cargado (repuestos,
          mano de obra, fotos del DVI o daños). Aparece en el Inicio y en el listado de órdenes.
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
