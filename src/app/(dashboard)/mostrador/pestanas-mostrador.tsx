"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PestanaMostrador = "vender" | "ventas";

/**
 * Pestañas Vender / Ventas. Cambiar no navega (solo deja `?tab=` en la URL) y los
 * dos paneles quedan montados: ir a ver las ventas no vacía el carrito a medias.
 */
export function PestanasMostrador({
  inicial,
  vender,
  ventas,
  ventasHoy,
}: {
  inicial: PestanaMostrador;
  vender: ReactNode;
  ventas: ReactNode;
  ventasHoy: number;
}) {
  const [activa, setActiva] = useState<PestanaMostrador>(inicial);
  const botones = useRef<(HTMLButtonElement | null)[]>([]);
  const pestanas: { id: PestanaMostrador; titulo: ReactNode }[] = [
    { id: "vender", titulo: "Vender" },
    {
      id: "ventas",
      titulo: (
        <>
          Ventas <span className="font-normal text-muted-foreground">({ventasHoy} hoy)</span>
        </>
      ),
    },
  ];

  function abrir(id: PestanaMostrador) {
    setActiva(id);
    const url = new URL(window.location.href);
    if (id === "vender") url.searchParams.delete("tab");
    else url.searchParams.set("tab", id);
    window.history.replaceState(window.history.state, "", url);
  }

  function moverCon(evento: KeyboardEvent<HTMLButtonElement>, indice: number) {
    if (evento.key !== "ArrowRight" && evento.key !== "ArrowLeft") return;
    evento.preventDefault();
    const siguiente = (indice + 1) % pestanas.length;
    abrir(pestanas[siguiente]!.id);
    botones.current[siguiente]?.focus();
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Mostrador" className="flex gap-1 self-start rounded-xl border border-border bg-muted p-1">
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
                "cursor-pointer rounded-lg px-4 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors",
                elegida ? "bg-card shadow-sm ring-1 ring-border" : "hover:bg-card/70",
              )}
            >
              {pestana.titulo}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id="panel-vender" aria-labelledby="pestana-vender" hidden={activa !== "vender"}>
        {vender}
      </div>
      <div role="tabpanel" id="panel-ventas" aria-labelledby="pestana-ventas" hidden={activa !== "ventas"}>
        {ventas}
      </div>
    </div>
  );
}
