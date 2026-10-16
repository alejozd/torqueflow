"use client";

import { useState } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { CalendarDays, ChevronDown } from "lucide-react";
import { CalendarioMes } from "@/components/ui/calendario-mes";
import { formatoDiaLargo } from "@/lib/agenda-cita";
import { formatoDiaBogota } from "@/lib/fecha-bogota";
import { PERIODOS, diasEntre, periodoDe, textoRango } from "@/lib/fechas-campo";
import { cn } from "@/lib/utils";

// Periodo desde/hasta: disparador con el nombre del periodo y sus días, atajos
// para los más usados y un calendario de rango junto a la lista de periodos.
// Solo maneja cadenas "aaaa-mm-dd" y emite dos campos ocultos, así los
// formularios GET (Reportes, Exportar) siguen enviando `desde` y `hasta`.

/** Índices de PERIODOS que van como atajos: Hoy, Esta semana, Este mes, Mes pasado. */
const ATAJOS_RANGO = [0, 2, 4, 5];

const nDias = (n: number) => (n === 1 ? "1 día" : `${n} días`);

export interface RangoFechasProps {
  /** id del botón (para <Label htmlFor>) y prefijo de los ids internos. */
  id: string;
  /** Por defecto "desde". */
  nameDesde?: string;
  /** Por defecto "hasta". */
  nameHasta?: string;
  defaultDesde: string;
  defaultHasta: string;
  onChange?: (desde: string, hasta: string) => void;
  /** Por defecto, hoy en Bogotá. */
  hoy?: string;
  /** Último día elegible; por defecto hoy. */
  max?: string;
  className?: string;
}

export function RangoFechas({
  id,
  nameDesde = "desde",
  nameHasta = "hasta",
  defaultDesde,
  defaultHasta,
  onChange,
  hoy: hoyProp,
  max: maxProp,
  className,
}: RangoFechasProps) {
  const hoy = hoyProp ?? formatoDiaBogota.format(new Date());
  const max = maxProp ?? hoy;
  const [rango, setRango] = useState({ desde: defaultDesde, hasta: defaultHasta });
  const [abierto, setAbierto] = useState(false);
  // Primer día tocado mientras se espera el último (null = sin rango a medias).
  const [primero, setPrimero] = useState<string | null>(null);
  // La llave vuelve a montar el calendario en el mes de `hasta` al abrir.
  const [vista, setVista] = useState(0);

  const periodo = periodoDe(rango.desde, rango.hasta, hoy);
  const dias = nDias(diasEntre(rango.desde, rango.hasta) + 1);

  function cambiar(desde: string, hasta: string) {
    setRango({ desde, hasta });
    onChange?.(desde, hasta);
  }

  function abrirOCerrar(abrir: boolean) {
    setAbierto(abrir);
    setPrimero(null);
    if (abrir) setVista((n) => n + 1);
  }

  // Al cerrar, Base UI devuelve el foco al disparador.
  function elegirPeriodo(indice: number) {
    const [desde, hasta] = PERIODOS[indice].rango(hoy);
    cambiar(desde, hasta);
    abrirOCerrar(false);
  }

  function elegirDia(dia: string) {
    if (primero == null) {
      setPrimero(dia);
      return;
    }
    // Si el segundo día es anterior, se invierten: el rango nunca queda al revés.
    if (dia < primero) cambiar(dia, primero);
    else cambiar(primero, dia);
    abrirOCerrar(false);
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <input type="hidden" name={nameDesde} value={rango.desde} />
      <input type="hidden" name={nameHasta} value={rango.hasta} />
      <PopoverPrimitive.Root open={abierto} onOpenChange={abrirOCerrar}>
        <PopoverPrimitive.Trigger
          id={id}
          aria-haspopup="dialog"
          aria-labelledby={`${id} ${id}-txt`}
          className={cn(
            "flex min-h-11 w-full items-center gap-2.5 rounded-lg border border-border bg-card py-1.5 pr-2.5 pl-1.5 text-left transition-colors",
            "hover:border-primary/45 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            "data-[popup-open]:border-primary data-[popup-open]:ring-3 data-[popup-open]:ring-primary/15",
          )}
        >
          <span className="grid size-7.5 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <CalendarDays className="size-4" aria-hidden />
          </span>
          <span id={`${id}-txt`} className="flex min-w-0 flex-1 flex-col leading-tight">
            {periodo >= 0 ? (
              <>
                <b className="truncate text-sm font-medium">{PERIODOS[periodo].etiqueta}</b>
                <small className="truncate text-xs text-muted-foreground tabular-nums">
                  {textoRango(rango.desde, rango.hasta, hoy)} · {dias}
                </small>
              </>
            ) : (
              <>
                <b className="truncate text-sm font-medium">{textoRango(rango.desde, rango.hasta, hoy)}</b>
                <small className="truncate text-xs text-muted-foreground tabular-nums">Personalizado · {dias}</small>
              </>
            )}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Positioner side="bottom" align="start" sideOffset={6} className="isolate z-50">
            <PopoverPrimitive.Popup
              aria-label="Elegir periodo"
              className={cn(
                "grid w-[min(30rem,calc(100vw-2rem))] grid-cols-1 gap-3.5 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg outline-none",
                "min-[520px]:grid-cols-[140px_1fr]",
              )}
            >
              {/* Bajo 520px los periodos van arriba, en fila y partidos en varias líneas. */}
              <div
                role="group"
                aria-label="Periodos"
                className={cn(
                  "flex flex-wrap gap-0.5 border-b border-border pb-2",
                  "min-[520px]:flex-col min-[520px]:flex-nowrap min-[520px]:border-r min-[520px]:border-b-0 min-[520px]:pr-2.5 min-[520px]:pb-0",
                )}
              >
                {PERIODOS.map((p, i) => {
                  const activo = i === periodo;
                  return (
                    <button
                      key={p.etiqueta}
                      type="button"
                      aria-pressed={activo}
                      onClick={() => elegirPeriodo(i)}
                      className={cn(
                        "rounded-lg px-2.25 py-1.75 text-left text-sm transition-colors",
                        "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                        activo ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted",
                      )}
                    >
                      {p.etiqueta}
                    </button>
                  );
                })}
              </div>
              <div className="min-w-0">
                <p aria-live="polite" className="mb-1.5 text-[12.5px] text-muted-foreground">
                  {primero
                    ? `Desde el ${formatoDiaLargo(primero)}. Ahora toca el último día.`
                    : "Toca el primer día y luego el último."}
                </p>
                <CalendarioMes
                  key={vista}
                  seleccionada={null}
                  hoy={hoy}
                  max={max}
                  rango={primero ? { desde: primero, hasta: null } : rango}
                  mesInicial={rango.hasta.slice(0, 7)}
                  onElegir={elegirDia}
                />
              </div>
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>

      <div role="group" aria-label="Atajos" className="flex flex-wrap gap-1.5">
        {ATAJOS_RANGO.map((i) => {
          const activo = i === periodo;
          return (
            <button
              key={i}
              type="button"
              aria-pressed={activo}
              onClick={() => {
                const [desde, hasta] = PERIODOS[i].rango(hoy);
                cambiar(desde, hasta);
              }}
              className={cn(
                "min-h-7.5 rounded-full border px-3 py-1 text-[12.5px] transition-colors",
                "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                activo ? "border-primary/40 bg-primary/10 font-medium text-primary" : "border-border hover:bg-muted",
              )}
            >
              {PERIODOS[i].etiqueta}
            </button>
          );
        })}
      </div>
    </div>
  );
}
