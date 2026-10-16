"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { diaSemana, diasDelMes, formatoDiaLargo, formatoMesLargo, sumarDias, sumarMeses } from "@/lib/agenda-cita";
import { cn } from "@/lib/utils";

const ENCABEZADO_SEMANA = ["do", "lu", "ma", "mi", "ju", "vi", "sá"];
// Ocupación en azul (dato informativo), separada del naranja de la selección.
const PUNTO_OCUPACION = "bg-sky-600 dark:bg-sky-400";

const nCitas = (n: number) => (n === 1 ? "1 cita" : `${n} citas`);

export interface CalendarioMesProps {
  /** Día marcado como elegido ("aaaa-mm-dd") o null. */
  seleccionada: string | null;
  hoy: string;
  /** Límites inclusive; días fuera quedan deshabilitados y no se navega a meses fuera. */
  min?: string;
  max?: string;
  /** Rango a pintar (tramo suave entre los dos, extremos en naranja). */
  rango?: { desde: string; hasta: string | null };
  /** Opcional: punto azul y texto en aria-label ("ya hay 2 citas"). */
  citasPorDia?: (dia: string) => number;
  /** Mes que se muestra al abrir ("aaaa-mm"); por defecto el de seleccionada, rango.desde o hoy. */
  mesInicial?: string;
  onElegir: (dia: string) => void;
}

export function CalendarioMes({ seleccionada, hoy, min, max, rango, citasPorDia, mesInicial, onElegir }: CalendarioMesProps) {
  const base = seleccionada ?? rango?.desde ?? hoy;
  const [mes, setMes] = useState(mesInicial ?? base.slice(0, 7));
  const [foco, setFoco] = useState(base);
  const gridRef = useRef<HTMLTableElement>(null);
  const deshabilitado = (dia: string) => (min != null && dia < min) || (max != null && dia > max);
  const puedeRetroceder = min == null || mes > min.slice(0, 7);
  const puedeAvanzar = max == null || mes < max.slice(0, 7);

  const desfase = diaSemana(`${mes}-01`);
  const total = diasDelMes(mes);
  const celdas: (string | null)[] = [
    ...Array.from({ length: desfase }, () => null),
    ...Array.from({ length: total }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`),
  ];
  while (celdas.length % 7) celdas.push(null);
  const semanas = Array.from({ length: celdas.length / 7 }, (_, i) => celdas.slice(i * 7, i * 7 + 7));
  const focoEnMes = foco.startsWith(mes)
    ? foco
    : base.startsWith(mes)
      ? base
      : hoy.startsWith(mes)
        ? hoy
        : `${mes}-01`;

  function cambiarMes(delta: number) {
    setMes(sumarMeses(mes, delta));
  }

  function tecla(evento: KeyboardEvent<HTMLButtonElement>, dia: string) {
    const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 }[evento.key];
    if (delta == null) return;
    evento.preventDefault();
    const destino = sumarDias(dia, delta);
    if (deshabilitado(destino)) return;
    setFoco(destino);
    setMes(destino.slice(0, 7));
    // El botón del mes nuevo existe hasta el próximo render.
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>(`[data-dia="${destino}"]`)?.focus());
  }

  const desde = rango?.desde;
  const hasta = rango?.hasta ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Mes anterior"
          disabled={!puedeRetroceder}
          onClick={() => cambiarMes(-1)}
          className="grid size-7 place-items-center rounded-md border border-border disabled:opacity-35"
        >
          <ChevronLeft className="size-4" />
        </button>
        <strong className="text-sm first-letter:uppercase">{formatoMesLargo(mes)}</strong>
        <button
          type="button"
          aria-label="Mes siguiente"
          disabled={!puedeAvanzar}
          onClick={() => cambiarMes(1)}
          className="grid size-7 place-items-center rounded-md border border-border disabled:opacity-35"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <table ref={gridRef} role="grid" aria-label={formatoMesLargo(mes)} className="w-full table-fixed border-collapse">
        <thead>
          <tr>
            {ENCABEZADO_SEMANA.map((dia) => (
              <th key={dia} scope="col" className="py-1 text-[11px] font-semibold text-muted-foreground uppercase">
                {dia}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {semanas.map((semana, i) => (
            <tr key={i}>
              {semana.map((dia, j) => {
                if (!dia) return <td key={`vacio-${j}`} />;
                const n = citasPorDia ? citasPorDia(dia) : 0;
                const esDesde = dia === desde;
                const esHasta = hasta != null && dia === hasta;
                const enTramo = desde != null && hasta != null && dia > desde && dia < hasta;
                const elegida = dia === seleccionada || esDesde || esHasta;
                const conTramo = desde != null && hasta != null && desde !== hasta;
                return (
                  <td key={dia} role="gridcell" aria-selected={elegida} className="p-px text-center">
                    <button
                      type="button"
                      data-dia={dia}
                      data-tramo={enTramo ? "" : undefined}
                      aria-pressed={elegida}
                      aria-current={dia === hoy ? "date" : undefined}
                      aria-label={`${formatoDiaLargo(dia)}${dia === hoy ? " (hoy)" : ""}${n ? `, ya hay ${nCitas(n)}` : ""}`}
                      tabIndex={dia === focoEnMes ? 0 : -1}
                      disabled={deshabilitado(dia)}
                      onClick={() => onElegir(dia)}
                      onKeyDown={(evento) => tecla(evento, dia)}
                      className={cn(
                        "relative aspect-square w-full rounded-md text-sm tabular-nums",
                        "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                        "disabled:cursor-default disabled:opacity-35",
                        elegida ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                        enTramo && "rounded-none bg-primary/10 hover:bg-primary/20",
                        conTramo && esDesde && "rounded-l-md rounded-r-none",
                        conTramo && esHasta && "rounded-l-none rounded-r-md",
                        dia === hoy && !elegida && "font-bold text-primary",
                      )}
                    >
                      {Number(dia.slice(8))}
                      {n ? (
                        <span
                          className={cn(
                            "absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full",
                            elegida ? "bg-primary-foreground" : PUNTO_OCUPACION,
                          )}
                        />
                      ) : null}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {citasPorDia ? (
        <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <i className={cn("size-1.5 rounded-full", PUNTO_OCUPACION)} /> ya hay citas ese día
        </span>
      ) : null}
    </div>
  );
}
