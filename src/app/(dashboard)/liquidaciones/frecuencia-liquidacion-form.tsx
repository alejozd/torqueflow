"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  guardarFrecuenciaLiquidacionAction,
  type FrecuenciaLiquidacionFormState,
} from "@/app/actions/liquidacion-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import type { FrecuenciaLiquidacion } from "@/generated/prisma-tenant";

const initialState: FrecuenciaLiquidacionFormState = { error: null, success: false, advertencia: null };

const FRECUENCIAS = [
  { value: "SEMANAL", label: "Semanal (semanas ISO, de lunes a domingo)" },
  { value: "QUINCENAL", label: "Quincenal (días 1–15 y 16–fin de mes)" },
  { value: "MENSUAL", label: "Mensual" },
];

/**
 * Cada cuánto liquida el taller (D5). Cambiarla no reinterpreta las
 * liquidaciones ya generadas -- cada una guarda su frecuencia --, pero si ya hay
 * del mes en curso la action devuelve una advertencia.
 */
export function FrecuenciaLiquidacionForm({ frecuencia }: { frecuencia: FrecuenciaLiquidacion }) {
  const [valor, setValor] = useState<FrecuenciaLiquidacion>(frecuencia);
  const [state, setState] = useState<FrecuenciaLiquidacionFormState>(initialState);
  const [isPending, startTransition] = useTransition();

  function guardar() {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("frecuencia", valor);

        const result = await guardarFrecuenciaLiquidacionAction(initialState, formData);
        setState(result);
        if (result.success) toast.success("Frecuencia de liquidación actualizada");
      } catch {
        toast.error("No se pudo guardar la frecuencia");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_auto] sm:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="frecuencia-liquidacion">Cada cuánto se liquida</Label>
          <SelectField
            id="frecuencia-liquidacion"
            items={FRECUENCIAS}
            value={valor}
            onValueChange={(nuevo) => setValor(nuevo as FrecuenciaLiquidacion)}
          />
        </div>
        <Button type="button" disabled={isPending} onClick={guardar}>
          {isPending ? "Guardando..." : "Guardar frecuencia"}
        </Button>
      </div>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.advertencia ? (
        <Alert>
          <AlertDescription>{state.advertencia}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
