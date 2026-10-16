"use client";

import { useState } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { ChevronDown, Clock } from "lucide-react";
import { CalendarioMes } from "@/components/ui/calendario-mes";
import {
  formatoHora12,
  leerValorFechaHora,
  momentoBogota,
  sumarDias,
  valorFechaHora,
  type MomentoBogota,
} from "@/lib/agenda-cita";
import { formatoDiaLargoConAnio } from "@/lib/fechas-campo";
import { cn } from "@/lib/utils";

// Campo de día + hora (seguimiento de cotización): disparador con el día en
// palabras y la hora debajo, atajos «Ahora» / «Hoy en la mañana» y un popover
// con el calendario a la izquierda y la columna de horas a la derecha.
// Solo maneja cadenas "aaaa-mm-ddTHH:mm" en hora de Bogotá (nunca Date).

const HORA_MANANA = 9 * 60;
// Botones cada 30 min de 6:00 a. m. a 8:00 p. m. (incluida).
const HORAS: number[] = Array.from({ length: (20 * 60 - 6 * 60) / 30 + 1 }, (_, i) => 6 * 60 + i * 30);

const capitalizar = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

export interface CampoFechaHoraProps {
  /** id del botón (para <Label htmlFor>) y prefijo de los ids internos. */
  id: string;
  /** Si viene, emite <input type="hidden" name value="aaaa-mm-ddTHH:mm">. */
  name?: string;
  /** "aaaa-mm-ddTHH:mm" (mismo formato que datetime-local); "" = sin valor. */
  value: string;
  onChange: (valor: string) => void;
  /** Se llama al cerrar el popover (react-hook-form). */
  onBlur?: () => void;
  /** Por defecto, el momento actual en Bogotá. */
  ahora?: MomentoBogota;
  /** No deja elegir un momento posterior a «ahora». */
  soloPasado?: boolean;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
}

export function CampoFechaHora({
  id,
  name,
  value,
  onChange,
  onBlur,
  ahora: ahoraProp,
  soloPasado,
  invalid,
  describedBy,
  className,
}: CampoFechaHoraProps) {
  const ahora = ahoraProp ?? momentoBogota(new Date());
  const hoy = ahora.fecha;
  // «Ahora» se redondea hacia abajo a 5 minutos.
  const ahora5 = ahora.minutos - (ahora.minutos % 5);
  const elegido = leerValorFechaHora(value);
  const [abierto, setAbierto] = useState(false);
  // Mes visible del calendario; la llave lo vuelve a montar al abrir.
  const [vista, setVista] = useState({ mes: hoy.slice(0, 7), n: 0 });

  const horaFutura = (fecha: string, minutos: number) => soloPasado === true && fecha === hoy && minutos > ahora.minutos;
  const horas = elegido && !HORAS.includes(elegido.minutos) ? [...HORAS, elegido.minutos].sort((a, b) => a - b) : HORAS;

  function abrirOCerrar(abrir: boolean) {
    setAbierto(abrir);
    if (abrir) setVista((v) => ({ mes: (elegido?.fecha ?? hoy).slice(0, 7), n: v.n + 1 }));
    else onBlur?.();
  }

  // Cambiar el día no cierra: falta elegir la hora. Si el día pasa a ser hoy
  // con una hora que todavía no llega, se ajusta a «Ahora».
  function elegirDia(dia: string) {
    const minutos = elegido?.minutos ?? (dia === hoy ? ahora5 : HORA_MANANA);
    onChange(valorFechaHora(dia, horaFutura(dia, minutos) ? ahora5 : minutos));
  }

  // Al cerrar, Base UI devuelve el foco al disparador.
  function elegirHora(minutos: number) {
    onChange(valorFechaHora(elegido?.fecha ?? hoy, minutos));
    abrirOCerrar(false);
  }

  const textoDia = (fecha: string) => {
    const largo = formatoDiaLargoConAnio(fecha, hoy);
    if (fecha === hoy) return `Hoy, ${largo}`;
    if (fecha === sumarDias(hoy, -1)) return `Ayer, ${largo}`;
    return capitalizar(largo);
  };

  const atajos = [
    { etiqueta: "Ahora", minutos: ahora5, visible: true },
    { etiqueta: "Hoy en la mañana", minutos: HORA_MANANA, visible: ahora.minutos >= HORA_MANANA },
  ].filter((atajo) => atajo.visible);

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <PopoverPrimitive.Root open={abierto} onOpenChange={abrirOCerrar}>
        <PopoverPrimitive.Trigger
          id={id}
          aria-haspopup="dialog"
          aria-labelledby={`${id} ${id}-txt`}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cn(
            "flex min-h-11 w-full items-center gap-2.5 rounded-lg border border-border bg-card py-1.5 pr-2.5 pl-1.5 text-left transition-colors",
            "hover:border-primary/45 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            "data-[popup-open]:border-primary data-[popup-open]:ring-3 data-[popup-open]:ring-primary/15",
            "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
          )}
        >
          <span className="grid size-7.5 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Clock className="size-4" aria-hidden />
          </span>
          <span id={`${id}-txt`} className="flex min-w-0 flex-1 flex-col leading-tight">
            {elegido ? (
              <>
                <b className="truncate text-sm font-medium">{textoDia(elegido.fecha)}</b>
                <small className="text-xs text-muted-foreground tabular-nums">a las {formatoHora12(elegido.minutos)}</small>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Elegir día y hora</span>
            )}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Positioner side="bottom" align="start" sideOffset={6} className="isolate z-50">
            <PopoverPrimitive.Popup
              aria-label="Elegir día y hora"
              className="w-[min(27rem,calc(100vw-2rem))] rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg outline-none"
            >
              <div className="grid grid-cols-[1fr_120px] gap-3.5 max-[520px]:grid-cols-1">
                <div id={`${id}-cal`} className="min-w-0">
                  <CalendarioMes
                    key={vista.n}
                    seleccionada={elegido?.fecha ?? null}
                    hoy={hoy}
                    max={soloPasado ? hoy : undefined}
                    mesInicial={vista.mes}
                    onElegir={elegirDia}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5 border-l border-border pl-3 max-[520px]:border-t max-[520px]:border-l-0 max-[520px]:pt-2 max-[520px]:pl-0">
                  <span className="text-xs font-semibold text-muted-foreground">Hora</span>
                  <div
                    role="group"
                    aria-label="Hora"
                    // Deja la hora elegida a la vista al abrir.
                    ref={(lista) => {
                      const sel = lista?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
                      if (lista && sel) lista.scrollTop = sel.offsetTop - lista.clientHeight / 2 + sel.offsetHeight / 2;
                    }}
                    className="relative flex max-h-67 flex-col gap-0.75 overflow-y-auto pr-0.5 max-[520px]:max-h-30 max-[520px]:flex-row max-[520px]:flex-wrap"
                  >
                    {horas.map((minutos) => {
                      const activa = elegido?.minutos === minutos;
                      return (
                        <button
                          key={minutos}
                          type="button"
                          aria-pressed={activa}
                          disabled={horaFutura(elegido?.fecha ?? hoy, minutos)}
                          onClick={() => elegirHora(minutos)}
                          className={cn(
                            "rounded-lg border px-2 py-1.5 text-[13px] tabular-nums",
                            "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                            "disabled:cursor-default disabled:opacity-30",
                            activa ? "border-primary bg-primary text-primary-foreground" : "border-border hover:not-disabled:bg-muted",
                          )}
                        >
                          {formatoHora12(minutos)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>

      <div role="group" aria-label="Atajos" className="flex flex-wrap gap-1.5">
        {atajos.map((atajo) => {
          const activo = elegido?.fecha === hoy && elegido.minutos === atajo.minutos;
          return (
            <button
              key={atajo.etiqueta}
              type="button"
              aria-pressed={activo}
              onClick={() => onChange(valorFechaHora(hoy, atajo.minutos))}
              className={cn(
                "min-h-7.5 rounded-full border px-3 py-1 text-[12.5px] transition-colors",
                "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                activo ? "border-primary/40 bg-primary/10 font-medium text-primary" : "border-border hover:bg-muted",
              )}
            >
              {atajo.etiqueta}
            </button>
          );
        })}
      </div>
    </div>
  );
}
