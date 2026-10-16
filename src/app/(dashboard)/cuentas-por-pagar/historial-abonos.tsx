"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { PUNTO, TEXTO_VERDE, pesos, plural } from "./presentacion";

/** Un abono ya formateado en el servidor (fechas en hora de Bogotá, sin desfase al hidratar). */
export interface AbonoHistorial {
  id: string;
  cuando: string;
  monto: number;
  metodo: string;
  referencia: string | null;
  registradoPor: string;
}

/**
 * «▾ 1 abono registrado»: despliega lo que ya se le pagó a la entrada. Viene
 * abierto cuando el último abono es de hoy, para ver enseguida lo recién hecho.
 */
export function HistorialAbonos({ abonos, abiertoInicial }: { abonos: AbonoHistorial[]; abiertoInicial: boolean }) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  const idLista = useId();
  if (abonos.length === 0) return null;

  return (
    <div className="-mt-1 flex flex-col gap-1.5">
      <button
        type="button"
        aria-expanded={abierto}
        aria-controls={idLista}
        onClick={() => setAbierto((valor) => !valor)}
        className="inline-flex w-max cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={cn("size-3.5 transition-transform", !abierto && "-rotate-90")} aria-hidden />
        {plural(abonos.length, "abono registrado", "abonos registrados")}
      </button>
      {abierto ? (
        <ul id={idLista} className="rounded-lg bg-muted/50 px-2.5 py-1 text-xs">
          {abonos.map((abono) => (
            <li
              key={abono.id}
              className="grid grid-cols-2 gap-x-2.5 gap-y-0.5 border-b border-dashed py-1 last:border-b-0 md:grid-cols-[150px_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)]"
            >
              <span>{abono.cuando}</span>
              <span className={cn("font-mono font-semibold tabular-nums", TEXTO_VERDE)}>{pesos(abono.monto)}</span>
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <span className={cn("size-1.5 shrink-0 rounded-full", PUNTO.azul)} aria-hidden />
                <span className="truncate">
                  {abono.metodo} · {abono.referencia ? `ref. ${abono.referencia}` : "sin referencia"}
                </span>
              </span>
              <span className="truncate text-muted-foreground">por {abono.registradoPor}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
