"use client";

import { useState } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { diasDelMes, formatoMesLargo, sumarMeses } from "@/lib/agenda-cita";
import { formatoDiaBogota } from "@/lib/fecha-bogota";
import { cn } from "@/lib/utils";

// Campo de mes: flechas para saltar de mes, disparador con el mes en palabras y
// un popover con la rejilla de los 12 meses del año. Solo maneja cadenas
// "aaaa-mm" (nunca Date) para que el mes no se corra por la zona horaria.

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const capitalizar = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

const claseFoco = "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

export interface CampoMesProps {
  /** id del botón (para <Label htmlFor>) y prefijo de los ids internos. */
  id: string;
  /** Si viene, emite <input type="hidden" name value="aaaa-mm" | "">. */
  name?: string;
  /** Controlado ("" = sin mes, solo con `opcional`). */
  value?: string;
  /** No controlado (formularios GET / FormData). */
  defaultValue?: string;
  onChange?: (mes: string) => void;
  /** Por defecto, hoy en Bogotá. */
  hoy?: string;
  /** Deja elegir meses futuros (plantillas); los filtros no. */
  permitirFuturo?: boolean;
  /** Muestra «Sin mes» y «Quitar». */
  opcional?: boolean;
  className?: string;
}

export function CampoMes({
  id,
  name,
  value,
  defaultValue,
  onChange,
  hoy: hoyProp,
  permitirFuturo,
  opcional,
  className,
}: CampoMesProps) {
  const hoy = hoyProp ?? formatoDiaBogota.format(new Date());
  const mesHoy = hoy.slice(0, 7);
  const anioHoy = Number(mesHoy.slice(0, 4));
  const [interno, setInterno] = useState(defaultValue ?? "");
  const valor = value ?? interno;
  const [abierto, setAbierto] = useState(false);
  const [anio, setAnio] = useState(anioHoy);

  const futuro = (mes: string) => !permitirFuturo && mes > mesHoy;

  function cambiar(nuevo: string) {
    if (value === undefined) setInterno(nuevo);
    onChange?.(nuevo);
  }

  function saltar(meses: number) {
    const destino = sumarMeses(valor || mesHoy, meses);
    if (!futuro(destino)) cambiar(destino);
  }

  function abrirOCerrar(abrir: boolean) {
    setAbierto(abrir);
    if (abrir) setAnio(Number((valor || mesHoy).slice(0, 4)));
  }

  // Al cerrar, Base UI devuelve el foco al disparador.
  function elegir(mes: string) {
    cambiar(mes);
    abrirOCerrar(false);
  }

  const atajos = permitirFuturo
    ? []
    : [
        { etiqueta: "Este mes", mes: mesHoy },
        { etiqueta: "Mes pasado", mes: sumarMeses(mesHoy, -1) },
      ];
  const botonFlecha = cn(
    "grid size-11 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors",
    "hover:border-primary/45 hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
    claseFoco,
  );

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      {name ? <input type="hidden" name={name} value={valor} /> : null}
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label="Mes anterior" onClick={() => saltar(-1)} className={botonFlecha}>
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <PopoverPrimitive.Root open={abierto} onOpenChange={abrirOCerrar}>
          <PopoverPrimitive.Trigger
            id={id}
            aria-haspopup="dialog"
            aria-labelledby={`${id} ${id}-txt`}
            className={cn(
              "flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-border bg-card py-1.5 pr-2.5 pl-1.5 text-left transition-colors",
              "hover:border-primary/45",
              claseFoco,
              "data-[popup-open]:border-primary data-[popup-open]:ring-3 data-[popup-open]:ring-primary/15",
            )}
          >
            <span className="grid size-7.5 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <CalendarDays className="size-4" aria-hidden />
            </span>
            <span id={`${id}-txt`} className="flex min-w-0 flex-1 flex-col leading-tight">
              {valor ? (
                <>
                  <b className="truncate text-sm font-medium">{capitalizar(formatoMesLargo(valor))}</b>
                  <small className="text-xs text-muted-foreground tabular-nums">
                    {valor === mesHoy
                      ? `Del 1 al ${Number(hoy.slice(8))}, va corriendo`
                      : `Mes completo · ${diasDelMes(valor)} días`}
                  </small>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">Sin mes</span>
              )}
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </PopoverPrimitive.Trigger>
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Positioner side="bottom" align="start" sideOffset={6} className="isolate z-50">
              <PopoverPrimitive.Popup
                aria-label="Elegir mes"
                className="w-64 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg outline-none"
              >
                <div className="mb-2 flex items-center justify-between">
                  <button
                    type="button"
                    aria-label="Año anterior"
                    onClick={() => setAnio((a) => a - 1)}
                    className={cn(botonFlecha, "size-8")}
                  >
                    <ChevronLeft className="size-4" aria-hidden />
                  </button>
                  <strong className="text-sm tabular-nums">{anio}</strong>
                  <button
                    type="button"
                    aria-label="Año siguiente"
                    disabled={!permitirFuturo && anio >= anioHoy}
                    onClick={() => setAnio((a) => a + 1)}
                    className={cn(botonFlecha, "size-8")}
                  >
                    <ChevronRight className="size-4" aria-hidden />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {MESES_CORTOS.map((corto, i) => {
                    const mes = `${anio}-${String(i + 1).padStart(2, "0")}`;
                    const elegido = mes === valor;
                    return (
                      <button
                        key={mes}
                        type="button"
                        disabled={futuro(mes)}
                        aria-pressed={elegido}
                        aria-label={formatoMesLargo(mes)}
                        onClick={() => elegir(mes)}
                        className={cn(
                          "min-h-10 rounded-lg text-sm transition-colors disabled:pointer-events-none disabled:opacity-35",
                          claseFoco,
                          elegido
                            ? "bg-primary font-medium text-primary-foreground"
                            : cn("hover:bg-muted", mes === mesHoy && "font-medium text-primary"),
                        )}
                      >
                        {corto}
                      </button>
                    );
                  })}
                </div>
                {opcional && valor ? (
                  <div className="mt-2 flex border-t border-border pt-2">
                    <button
                      type="button"
                      onClick={() => elegir("")}
                      className={cn(
                        "rounded-md px-2 py-1 text-sm font-medium text-muted-foreground hover:bg-muted",
                        claseFoco,
                      )}
                    >
                      Quitar
                    </button>
                  </div>
                ) : null}
              </PopoverPrimitive.Popup>
            </PopoverPrimitive.Positioner>
          </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
        <button
          type="button"
          aria-label="Mes siguiente"
          disabled={futuro(sumarMeses(valor || mesHoy, 1))}
          onClick={() => saltar(1)}
          className={botonFlecha}
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>

      {atajos.length ? (
        <div role="group" aria-label="Atajos" className="flex flex-wrap gap-1.5">
          {atajos.map((atajo) => {
            const activo = atajo.mes === valor;
            return (
              <button
                key={atajo.etiqueta}
                type="button"
                aria-pressed={activo}
                onClick={() => cambiar(atajo.mes)}
                className={cn(
                  "min-h-7.5 rounded-full border px-3 py-1 text-[12.5px] transition-colors",
                  claseFoco,
                  activo ? "border-primary/40 bg-primary/10 font-medium text-primary" : "border-border hover:bg-muted",
                )}
              >
                {atajo.etiqueta}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
