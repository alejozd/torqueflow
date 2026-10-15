"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { PestanaOrden } from "@/lib/orden/pestanas";

export interface Pestana {
  id: PestanaOrden;
  titulo: string;
  resumen: string;
  color: string;
  panel: ReactNode;
}

/**
 * Las partes de la orden en pestañas: cada una dice su resumen sin abrirla.
 * Cambiar de pestaña no navega (solo deja `?tab=` en la URL) y los paneles
 * quedan montados, así un formulario a medio llenar no se pierde.
 */
export function PestanasOrden({ pestanas, inicial }: { pestanas: Pestana[]; inicial: PestanaOrden }) {
  const [activa, setActiva] = useState<PestanaOrden>(inicial);
  const botones = useRef<(HTMLButtonElement | null)[]>([]);

  function abrir(id: PestanaOrden) {
    setActiva(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.replaceState(window.history.state, "", url);
  }

  function moverCon(evento: KeyboardEvent<HTMLButtonElement>, indice: number) {
    if (evento.key !== "ArrowRight" && evento.key !== "ArrowLeft") return;
    evento.preventDefault();
    const siguiente = (indice + (evento.key === "ArrowRight" ? 1 : -1) + pestanas.length) % pestanas.length;
    abrir(pestanas[siguiente]!.id);
    botones.current[siguiente]?.focus();
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Partes de la orden"
        className="sticky top-0 z-10 flex gap-1 overflow-x-auto rounded-xl border border-border bg-muted p-1 [scrollbar-width:none]"
      >
        {pestanas.map((pestana, indice) => {
          const elegida = pestana.id === activa;
          return (
            <button
              key={pestana.id}
              ref={(nodo) => {
                botones.current[indice] = nodo;
              }}
              type="button"
              role="tab"
              id={`pestana-${pestana.id}`}
              aria-selected={elegida}
              aria-controls={`panel-${pestana.id}`}
              tabIndex={elegida ? 0 : -1}
              onClick={() => abrir(pestana.id)}
              onKeyDown={(evento) => moverCon(evento, indice)}
              className={cn(
                "flex flex-1 shrink-0 flex-col items-start gap-0.5 rounded-lg px-3.5 py-2 text-left whitespace-nowrap transition-colors",
                elegida ? "bg-card shadow-sm ring-1 ring-border" : "hover:bg-card/60",
              )}
            >
              <span className="text-sm font-semibold">{pestana.titulo}</span>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: pestana.color }} />
                {pestana.resumen}
              </span>
            </button>
          );
        })}
      </div>
      {pestanas.map((pestana) => (
        <div
          key={pestana.id}
          role="tabpanel"
          id={`panel-${pestana.id}`}
          aria-labelledby={`pestana-${pestana.id}`}
          hidden={pestana.id !== activa}
          className="flex flex-col gap-4"
        >
          {pestana.panel}
        </div>
      ))}
    </div>
  );
}
