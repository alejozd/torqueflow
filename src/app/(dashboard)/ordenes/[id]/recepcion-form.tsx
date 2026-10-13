"use client";

import { useActionState, useState } from "react";
import { guardarRecepcionAction, type RecepcionFormState } from "@/app/actions/recepcion-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import type { NivelCombustible } from "@/generated/prisma-tenant";

const initialState: RecepcionFormState = { error: null, success: false };

export const NIVELES: { value: NivelCombustible; label: string }[] = [
  { value: "VACIO", label: "Vacío" },
  { value: "CUARTO", label: "1/4" },
  { value: "MEDIO", label: "1/2" },
  { value: "TRES_CUARTOS", label: "3/4" },
  { value: "LLENO", label: "Lleno" },
];

export const etiquetaNivel = (nivel: NivelCombustible | null) =>
  NIVELES.find((opcion) => opcion.value === nivel)?.label ?? "Sin registrar";

/**
 * Recepción del vehículo: con qué kilometraje y con cuánto combustible entró. Se
 * imprime en el acta de entrega, así que se guarda desde el primer momento.
 */
export function RecepcionForm({
  ordenId,
  kilometrajeIngreso,
  nivelCombustible,
  soloLectura,
}: {
  ordenId: string;
  kilometrajeIngreso: number | null;
  nivelCombustible: NivelCombustible | null;
  soloLectura: boolean;
}) {
  const guardar = guardarRecepcionAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(guardar, initialState);
  const [nivel, setNivel] = useState<NivelCombustible | "">(nivelCombustible ?? "");

  if (soloLectura) {
    return (
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-[10px] tracking-wide text-muted-foreground uppercase">Kilometraje de ingreso</dt>
          <dd className="mt-0.5 font-mono">{kilometrajeIngreso === null ? "Sin registrar" : kilometrajeIngreso}</dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-wide text-muted-foreground uppercase">Combustible</dt>
          <dd className="mt-0.5">{etiquetaNivel(nivelCombustible)}</dd>
        </div>
      </dl>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="flex w-40 flex-col gap-1.5">
        <Label htmlFor="kilometrajeIngreso">Kilometraje</Label>
        <Input
          id="kilometrajeIngreso"
          name="kilometrajeIngreso"
          type="number"
          min={0}
          defaultValue={kilometrajeIngreso ?? ""}
          placeholder="85000"
        />
      </div>
      <div className="flex w-32 flex-col gap-1.5">
        <Label htmlFor="nivelCombustible">Combustible</Label>
        <SelectField
          id="nivelCombustible"
          items={NIVELES}
          value={nivel}
          onValueChange={(valor) => setNivel(valor as NivelCombustible)}
          placeholder="Sin dato"
        />
        <input type="hidden" name="nivelCombustible" value={nivel} />
      </div>
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "Guardando..." : "Guardar recepción"}
      </Button>
      {state.error ? (
        <Alert variant="destructive" className="w-full">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? (
        <p role="status" className="w-full text-xs text-muted-foreground">
          Recepción guardada.
        </p>
      ) : null}
    </form>
  );
}
