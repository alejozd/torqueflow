"use client";

import { useState, type KeyboardEvent } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { CalendarDays, ChevronDown } from "lucide-react";
import { CalendarioMes } from "@/components/ui/calendario-mes";
import { formatoDiaBogota } from "@/lib/fecha-bogota";
import {
  ATAJOS,
  ayudaFecha,
  fechaDeAtajo,
  formatoDiaLargoConAnio,
  formatoNumerico,
  leerFechaEscrita,
  type TipoFecha,
  type Tono,
} from "@/lib/fechas-campo";
import { cn } from "@/lib/utils";

// Campo de fecha suelta: disparador con el día en palabras, atajos por caso,
// una línea de ayuda y un calendario donde también se puede escribir la fecha.
// Solo maneja cadenas "aaaa-mm-dd" (nunca Date) para que el día no se corra.

const TONO_AYUDA: Record<Tono, string> = {
  ok: "text-emerald-700 dark:text-emerald-400",
  aviso: "text-amber-700 dark:text-amber-400",
  vencido: "font-medium text-destructive",
  neutro: "text-muted-foreground",
};

const capitalizar = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

export interface CampoFechaProps {
  /** id del botón (para <Label htmlFor>) y prefijo de los ids internos. */
  id: string;
  /** Si viene, emite <input type="hidden" name value="aaaa-mm-dd" | "">. */
  name?: string;
  tipo: TipoFecha;
  /** Controlado ("" = sin fecha). */
  value?: string;
  /** No controlado (formularios GET / FormData). */
  defaultValue?: string;
  onChange?: (valor: string) => void;
  /** Se llama al cerrar el calendario (react-hook-form). */
  onBlur?: () => void;
  /** Por defecto, hoy en Bogotá. */
  hoy?: string;
  min?: string;
  max?: string;
  /** Oculta «Borrar». */
  obligatorio?: boolean;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
}

export function CampoFecha({
  id,
  name,
  tipo,
  value,
  defaultValue,
  onChange,
  onBlur,
  hoy: hoyProp,
  min,
  max,
  obligatorio,
  invalid,
  describedBy,
  className,
}: CampoFechaProps) {
  const hoy = hoyProp ?? formatoDiaBogota.format(new Date());
  const [interno, setInterno] = useState(defaultValue ?? "");
  const valor = value ?? interno;
  const [abierto, setAbierto] = useState(false);
  const [escrito, setEscrito] = useState("");
  const [error, setError] = useState("");
  // Fecha escrita válida que se marca en el calendario antes de confirmarla.
  const [previa, setPrevia] = useState<string | null>(null);
  // Mes visible del calendario; la llave lo vuelve a montar al saltar de mes.
  const [vista, setVista] = useState({ mes: hoy.slice(0, 7), n: 0 });

  const fuera = (dia: string) => (min != null && dia < min) || (max != null && dia > max);
  const motivoFuera = (dia: string) =>
    max != null && dia > max ? "No puede ser una fecha futura" : min != null && dia < min ? "Esa fecha ya pasó" : "";
  const atajos = ATAJOS[tipo]
    .map((atajo) => ({ etiqueta: atajo.etiqueta, dia: fechaDeAtajo(atajo, hoy) }))
    .filter((atajo) => !fuera(atajo.dia));
  const ayuda = ayudaFecha(tipo, valor || null, hoy);

  function cambiar(nuevo: string) {
    if (value === undefined) setInterno(nuevo);
    onChange?.(nuevo);
  }

  function abrirOCerrar(abrir: boolean) {
    setAbierto(abrir);
    if (abrir) {
      setEscrito(valor ? formatoNumerico(valor) : "");
      setError("");
      setPrevia(null);
      setVista((v) => ({ mes: (valor || hoy).slice(0, 7), n: v.n + 1 }));
    } else {
      onBlur?.();
    }
  }

  // Al cerrar, Base UI devuelve el foco al disparador.
  function elegir(dia: string) {
    cambiar(dia);
    abrirOCerrar(false);
  }

  function escribir(texto: string) {
    setEscrito(texto);
    setError("");
    const dia = leerFechaEscrita(texto);
    const valida = dia && !motivoFuera(dia) ? dia : null;
    setPrevia(valida);
    if (valida && !valida.startsWith(vista.mes)) setVista((v) => ({ mes: valida.slice(0, 7), n: v.n + 1 }));
  }

  function teclaEscrita(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key !== "Enter") return;
    evento.preventDefault();
    const dia = leerFechaEscrita(escrito);
    const problema = !dia ? "Escríbela así: 16/10/2026" : motivoFuera(dia);
    if (problema || !dia) {
      setError(problema);
      return;
    }
    elegir(dia);
  }

  function irAHoy() {
    setVista((v) => ({ mes: hoy.slice(0, 7), n: v.n + 1 }));
    // El calendario se vuelve a montar; el botón de hoy existe en el próximo cuadro.
    requestAnimationFrame(() => document.getElementById(`${id}-cal`)?.querySelector<HTMLButtonElement>(`[data-dia="${hoy}"]`)?.focus());
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      {name ? <input type="hidden" name={name} value={valor} /> : null}
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
            <CalendarDays className="size-4" aria-hidden />
          </span>
          <span id={`${id}-txt`} className="flex min-w-0 flex-1 flex-col leading-tight">
            {valor ? (
              <>
                <b className="truncate text-sm font-medium">{capitalizar(formatoDiaLargoConAnio(valor, hoy))}</b>
                <small className="text-xs text-muted-foreground tabular-nums">{formatoNumerico(valor)}</small>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Elegir fecha</span>
            )}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Positioner side="bottom" align="start" sideOffset={6} className="isolate z-50">
            <PopoverPrimitive.Popup
              aria-label="Elegir fecha"
              className="w-72 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg outline-none"
            >
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <label htmlFor={`${id}-escrita`}>Escríbela</label>
                <input
                  id={`${id}-escrita`}
                  inputMode="numeric"
                  placeholder="dd/mm/aaaa"
                  autoComplete="off"
                  value={escrito}
                  onChange={(evento) => escribir(evento.target.value)}
                  onKeyDown={teclaEscrita}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-escrita-error` : undefined}
                  className={cn(
                    "h-8.5 min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground tabular-nums",
                    "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    "aria-invalid:border-destructive",
                  )}
                />
              </div>
              <p id={`${id}-escrita-error`} aria-live="polite" className="-mt-0.5 mb-2 text-xs text-destructive empty:hidden">
                {error}
              </p>
              <div id={`${id}-cal`}>
                <CalendarioMes
                  key={vista.n}
                  seleccionada={previa ?? (valor || null)}
                  hoy={hoy}
                  min={min}
                  max={max}
                  mesInicial={vista.mes}
                  onElegir={elegir}
                />
              </div>
              <div className="mt-2 flex justify-between gap-2 border-t border-border pt-2">
                {obligatorio ? (
                  <span />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      cambiar("");
                      abrirOCerrar(false);
                    }}
                    className="rounded-md px-2 py-1 text-sm font-medium text-muted-foreground hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    Borrar
                  </button>
                )}
                <button
                  type="button"
                  onClick={irAHoy}
                  className="rounded-md px-2 py-1 text-sm font-medium text-primary hover:bg-primary/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  Ir a hoy
                </button>
              </div>
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>

      {atajos.length ? (
        <div role="group" aria-label="Atajos" className="flex flex-wrap gap-1.5">
          {atajos.map((atajo) => {
            const activo = atajo.dia === valor;
            return (
              <button
                key={atajo.etiqueta}
                type="button"
                aria-pressed={activo}
                onClick={() => cambiar(atajo.dia)}
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
      ) : null}

      <p aria-live="polite" className={cn("flex items-center gap-1.75 text-[12.5px] empty:hidden", ayuda && TONO_AYUDA[ayuda.tono])}>
        {ayuda ? (
          <>
            <span className="size-1.75 shrink-0 rounded-full bg-current" aria-hidden />
            {ayuda.texto}
          </>
        ) : null}
      </p>
    </div>
  );
}
