"use client";

import { startTransition, useActionState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cambiarPrioridadAction, type PrioridadFormState } from "@/app/actions/orden-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ETIQUETA_PRIORIDAD } from "@/lib/orden/flujo";
import type { PrioridadOrden } from "@/generated/prisma-tenant";
import { PRIORIDAD_ICONO } from "./prioridad-badge";
import { PRIORIDAD_COLOR, PRIORIDAD_DESCRIPCION } from "./prioridad-tono";

const initialState: PrioridadFormState = { error: null, success: false };

const NIVELES: PrioridadOrden[] = ["URGENTE", "ALTA", "NORMAL", "BAJA"];

/**
 * La prioridad de la orden como protagonista (Fase 22, D3): se lee de un vistazo
 * (ícono, nombre y qué significa) y se cambia por excepción desde el menú
 * "Cambiar", que guarda al elegir. Solo ADMIN/RECEPCION y mientras la orden sea
 * editable; la acción lo vuelve a comprobar en el servidor.
 */
export function PrioridadBloque({
  ordenId,
  prioridad,
  editable,
}: {
  ordenId: string;
  prioridad: PrioridadOrden;
  editable: boolean;
}) {
  const cambiar = cambiarPrioridadAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(cambiar, initialState);
  const Icono = PRIORIDAD_ICONO[prioridad];
  const color = PRIORIDAD_COLOR[prioridad];

  function elegir(nivel: PrioridadOrden) {
    if (nivel === prioridad) return;
    const formData = new FormData();
    formData.set("prioridad", nivel);
    startTransition(() => formAction(formData));
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex items-center gap-3 rounded-lg border p-3"
        style={{
          borderColor: `color-mix(in oklch, ${color} 30%, transparent)`,
          background: `color-mix(in oklch, ${color} 8%, transparent)`,
        }}
      >
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-white"
          style={{ background: color }}
        >
          <Icono className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-semibold">
            Prioridad {ETIQUETA_PRIORIDAD[prioridad]}
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
          </p>
          <p className="text-xs text-muted-foreground">{PRIORIDAD_DESCRIPCION[prioridad]}</p>
        </div>
        {editable ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button type="button" variant="outline" size="sm" className="shrink-0" disabled={isPending} />}
            >
              {isPending ? "Guardando..." : "Cambiar"}
              <ChevronDown className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {/* Base UI: el título va dentro de un grupo y los ítems reaccionan a onClick. */}
              <DropdownMenuGroup>
                <DropdownMenuLabel>Cambiar a…</DropdownMenuLabel>
                {NIVELES.map((nivel) => {
                  const IconoNivel = PRIORIDAD_ICONO[nivel];
                  return (
                    <DropdownMenuItem key={nivel} disabled={nivel === prioridad} onClick={() => elegir(nivel)}>
                      <IconoNivel className="size-3.5" style={{ color: PRIORIDAD_COLOR[nivel] }} />
                      {ETIQUETA_PRIORIDAD[nivel]}
                      {nivel === prioridad ? <Check className="ml-auto size-3.5" /> : null}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {!editable ? (
        <p className="text-xs text-muted-foreground">La orden ya no se puede modificar, así que la prioridad queda como está.</p>
      ) : null}
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
