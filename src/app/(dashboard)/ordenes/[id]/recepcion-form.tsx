"use client";

import { useState } from "react";
import { guardarRecepcionAction, type RecepcionFormState } from "@/app/actions/recepcion-actions";
import { EstadoGuardado } from "@/components/estado-guardado";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAutoguardado } from "@/hooks/use-autoguardado";
import { cn } from "@/lib/utils";
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
 * imprime en el acta de entrega, así que se guarda desde el primer momento, y
 * solo: el combustible al elegirlo y el kilometraje al salir del campo.
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
  const { guardar: autoguardar, fase, error } = useAutoguardado(guardar, initialState);
  const [nivel, setNivel] = useState<NivelCombustible | "">(nivelCombustible ?? "");
  const [km, setKm] = useState(kilometrajeIngreso === null ? "" : String(kilometrajeIngreso));
  const [kmGuardado, setKmGuardado] = useState(km);

  function enviar(kilometraje: string, nivelElegido: NivelCombustible | "") {
    const formData = new FormData();
    formData.set("kilometrajeIngreso", kilometraje);
    formData.set("nivelCombustible", nivelElegido);
    autoguardar(formData);
  }

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
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-lg bg-muted/50 px-3.5 py-3">
      <div className="flex w-36 flex-col gap-1.5">
        <Label htmlFor="kilometrajeIngreso">Kilometraje</Label>
        <Input
          id="kilometrajeIngreso"
          type="number"
          min={0}
          value={km}
          placeholder="85000"
          className="bg-card font-mono"
          onChange={(evento) => setKm(evento.target.value)}
          onBlur={() => {
            if (km === kmGuardado) return;
            setKmGuardado(km);
            enviar(km, nivel);
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span id="combustible-etiqueta" className="text-sm font-medium">
          Combustible
        </span>
        <div
          role="radiogroup"
          aria-labelledby="combustible-etiqueta"
          className="inline-flex overflow-hidden rounded-lg border border-border bg-card"
        >
          {NIVELES.map((opcion) => (
            <button
              key={opcion.value}
              type="button"
              role="radio"
              aria-checked={nivel === opcion.value}
              onClick={() => {
                setNivel(opcion.value);
                enviar(km, opcion.value);
              }}
              className={cn(
                "border-r border-border px-2.5 py-1 text-xs last:border-r-0",
                nivel === opcion.value ? "bg-foreground text-background" : "hover:bg-muted",
              )}
            >
              {opcion.label}
            </button>
          ))}
        </div>
      </div>
      <EstadoGuardado fase={fase} error={error} className="pb-1.5" />
      {fase === "inactivo" ? (
        <span className="pb-1.5 text-xs text-muted-foreground">Se guarda solo al cambiar</span>
      ) : null}
    </div>
  );
}
