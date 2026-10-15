"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import {
  diaSemana,
  diasDelMes,
  esMomentoPasado,
  formatoDiaCorto,
  formatoDiaLargo,
  formatoHora12,
  formatoMesLargo,
  horasDelDia,
  leerHoraEscrita,
  leerValorFechaHora,
  nombreDiaCorto,
  nombreMesCorto,
  sumarDias,
  sumarMeses,
  valorFechaHora,
  type MomentoBogota,
  type OcupacionCita,
} from "@/lib/agenda-cita";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const MEDIODIA = 12 * 60;
const ENCABEZADO_SEMANA = ["do", "lu", "ma", "mi", "ju", "vi", "sá"];
// Ocupación en azul (dato informativo), separada del naranja de la selección.
const TONO_OCUPACION = "text-sky-700 dark:text-sky-400";
const PUNTO_OCUPACION = "bg-sky-600 dark:bg-sky-400";

const nCitas = (n: number) => (n === 1 ? "1 cita" : `${n} citas`);

export interface SelectorFechaHoraProps {
  /** Prefijo de los ids internos. */
  id: string;
  /** Nombre del campo oculto que viaja en el FormData. */
  name: string;
  /** "YYYY-MM-DDTHH:mm" en hora de Bogotá, o "" mientras falte el día o la hora. */
  value: string;
  onChange: (valor: string) => void;
  /** Lo calcula el servidor para que la hora del navegador no cuente. */
  ahora: MomentoBogota;
  /** Citas ya agendadas de la sede (sin canceladas ni la que se edita). */
  ocupacion: OcupacionCita[];
  /** Valor guardado de la cita que se edita: su hora se respeta aunque ya haya pasado. */
  valorOriginal?: string;
  apertura?: number;
  cierre?: number;
  paso?: number;
  diasVisibles?: number;
  invalid?: boolean;
  describedBy?: string;
}

/**
 * Elegir día y hora de una cita en dos clics: tira de los próximos días,
 * horas en botones (mañana / tarde), calendario para fechas lejanas y un
 * campo para horas fuera de la grilla. Muestra las citas que ya hay como
 * contexto, sin bloquear nada: el modelo no tiene capacidad por franja.
 */
export function SelectorFechaHora({
  id,
  name,
  value,
  onChange,
  ahora,
  ocupacion,
  valorOriginal,
  apertura = 7 * 60,
  cierre = 18 * 60,
  paso = 30,
  diasVisibles = 14,
  invalid,
  describedBy,
}: SelectorFechaHoraProps) {
  const elegido = leerValorFechaHora(value);
  const original = valorOriginal ? leerValorFechaHora(valorOriginal) : null;
  const [fecha, setFecha] = useState(elegido?.fecha ?? ahora.fecha);
  const hora = elegido && elegido.fecha === fecha ? elegido.minutos : null;
  const [calendarioAbierto, setCalendarioAbierto] = useState(false);
  const [horaEscrita, setHoraEscrita] = useState("");
  const [avisoHora, setAvisoHora] = useState<{ texto: string; error: boolean } | null>(null);
  const tiraRef = useRef<HTMLDivElement>(null);
  const horasRef = useRef<HTMLDivElement>(null);
  const idDia = useId();
  const idHora = useId();

  const esOriginal = (f: string, minutos: number) => original?.fecha === f && original.minutos === minutos;
  const bloqueada = (f: string, minutos: number) => esMomentoPasado(f, minutos, ahora) && !esOriginal(f, minutos);
  const citasDe = (f: string) => ocupacion.filter((cita) => cita.fecha === f);

  function elegirFecha(nueva: string) {
    setFecha(nueva);
    setAvisoHora(null);
    // Conserva la hora al cambiar de día, salvo que en el día nuevo ya haya pasado.
    onChange(hora != null && !bloqueada(nueva, hora) ? valorFechaHora(nueva, hora) : "");
  }

  function elegirHora(minutos: number) {
    setAvisoHora(null);
    setHoraEscrita("");
    onChange(valorFechaHora(fecha, minutos));
  }

  // ---- tira de días ----
  const dias = Array.from({ length: diasVisibles }, (_, i) => sumarDias(ahora.fecha, i));
  const fechaEnTira = dias.includes(fecha);
  const diaConFoco = fechaEnTira ? fecha : dias[0];

  function teclaEnTira(evento: KeyboardEvent<HTMLButtonElement>, indice: number) {
    const destino = moverIndice(evento.key, indice, dias.length);
    if (destino == null) return;
    evento.preventDefault();
    elegirFecha(dias[destino]);
    tiraRef.current?.querySelectorAll<HTMLButtonElement>("[role=radio]")[destino]?.focus();
  }

  // ---- horas ----
  const grilla = horasDelDia(apertura, cierre, paso);
  const horas = hora != null && !grilla.includes(hora) ? [...grilla, hora].sort((a, b) => a - b) : grilla;
  const disponibles = horas.filter((minutos) => !bloqueada(fecha, minutos));
  const horaConFoco = hora != null ? hora : disponibles[0];
  const citasDelDia = citasDe(fecha);

  function teclaEnHoras(evento: KeyboardEvent<HTMLButtonElement>, minutos: number) {
    const indice = disponibles.indexOf(minutos);
    const destino = moverIndice(evento.key, indice, disponibles.length);
    if (destino == null) return;
    evento.preventDefault();
    const nueva = disponibles[destino];
    elegirHora(nueva);
    horasRef.current?.querySelector<HTMLButtonElement>(`[data-minutos="${nueva}"]`)?.focus();
  }

  function aplicarHoraEscrita() {
    if (!horaEscrita.trim()) return;
    const minutos = leerHoraEscrita(horaEscrita);
    if (minutos == null) {
      setAvisoHora({ texto: "No entendí esa hora. Prueba con 10:15 o 3:45 pm.", error: true });
      return;
    }
    if (bloqueada(fecha, minutos)) {
      setAvisoHora({ texto: `Las ${formatoHora12(minutos)} de ese día ya pasaron.`, error: true });
      return;
    }
    onChange(valorFechaHora(fecha, minutos));
    setHoraEscrita("");
    setAvisoHora({ texto: `Listo: ${formatoHora12(minutos)}`, error: false });
  }

  const botonHora = (minutos: number) => {
    const n = citasDelDia.filter((cita) => cita.minutos >= minutos && cita.minutos < minutos + paso).length;
    const pasada = bloqueada(fecha, minutos);
    const seleccionada = minutos === hora;
    const escrita = !grilla.includes(minutos);
    return (
      <button
        key={minutos}
        type="button"
        role="radio"
        data-minutos={minutos}
        aria-checked={seleccionada}
        aria-disabled={pasada || undefined}
        tabIndex={minutos === horaConFoco ? 0 : -1}
        aria-label={`${formatoHora12(minutos)}${pasada ? ", ya pasó" : ""}${n ? `, ya hay ${nCitas(n)}` : ""}`}
        onClick={() => {
          if (!pasada) elegirHora(minutos);
        }}
        onKeyDown={(evento) => teclaEnHoras(evento, minutos)}
        className={cn(
          "flex min-h-11 flex-col items-center justify-center rounded-lg border bg-card px-1 py-1 transition-colors",
          "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          escrita && "border-dashed",
          seleccionada
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border hover:border-muted-foreground/60",
          pasada && "cursor-not-allowed bg-muted opacity-45",
        )}
      >
        <span className={cn("text-sm font-semibold whitespace-nowrap tabular-nums", pasada && "line-through")}>
          {formatoHora12(minutos)}
        </span>
        <span
          className={cn(
            "flex h-3.5 items-center gap-1 text-[10.5px] whitespace-nowrap",
            seleccionada ? "text-primary-foreground" : TONO_OCUPACION,
          )}
        >
          {n ? (
            <>
              <i className={cn("size-1.5 rounded-full", seleccionada ? "bg-primary-foreground" : PUNTO_OCUPACION)} />
              {nCitas(n)}
            </>
          ) : null}
        </span>
      </button>
    );
  };

  const manana = horas.filter((minutos) => minutos < MEDIODIA);
  const tarde = horas.filter((minutos) => minutos >= MEDIODIA);
  const relativo = fecha === ahora.fecha ? "hoy" : fecha === sumarDias(ahora.fecha, 1) ? "mañana" : null;

  return (
    <div className="flex min-w-0 flex-col gap-4" aria-describedby={describedBy}>
      <input type="hidden" name={name} value={value} />

      <div className="flex min-w-0 flex-col gap-2">
        <span id={idDia} className="text-sm font-medium">
          Día
        </span>
        <div className="flex min-w-0 items-stretch gap-2">
          <div
            ref={tiraRef}
            role="radiogroup"
            aria-labelledby={idDia}
            aria-invalid={invalid || undefined}
            className="flex min-w-0 flex-1 snap-x gap-1.5 overflow-x-auto pb-1.5"
          >
            {dias.map((dia, indice) => {
              const n = citasDe(dia).length;
              const seleccionado = dia === fecha;
              const etiqueta = indice === 0 ? "Hoy" : indice === 1 ? "Mañana" : nombreDiaCorto(dia);
              return (
                <button
                  key={dia}
                  type="button"
                  role="radio"
                  aria-checked={seleccionado}
                  tabIndex={dia === diaConFoco ? 0 : -1}
                  aria-label={`${indice === 0 ? "Hoy, " : indice === 1 ? "Mañana, " : ""}${formatoDiaLargo(dia)}${n ? `, ya hay ${nCitas(n)}` : ""}`}
                  onClick={() => elegirFecha(dia)}
                  onKeyDown={(evento) => teclaEnTira(evento, indice)}
                  className={cn(
                    "flex w-16 shrink-0 snap-start flex-col items-center rounded-lg border px-1 pt-1.5 pb-1 transition-colors",
                    "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    seleccionado
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:border-muted-foreground/60",
                  )}
                >
                  <span
                    className={cn(
                      "text-[11px] font-semibold tracking-wide uppercase",
                      seleccionado
                        ? "text-primary-foreground"
                        : diaSemana(dia) === 0
                          ? "text-destructive"
                          : "text-muted-foreground",
                    )}
                  >
                    {etiqueta}
                  </span>
                  <span className="text-lg leading-tight font-semibold tabular-nums">{Number(dia.slice(8))}</span>
                  <span className={cn("text-[11px]", seleccionado ? "text-primary-foreground" : "text-muted-foreground")}>
                    {nombreMesCorto(dia)}
                  </span>
                  <span
                    className={cn(
                      "h-4 text-[10.5px] font-medium whitespace-nowrap",
                      seleccionado ? "text-primary-foreground" : TONO_OCUPACION,
                    )}
                  >
                    {n ? `● ${nCitas(n)}` : ""}
                  </span>
                </button>
              );
            })}
          </div>

          <PopoverPrimitive.Root open={calendarioAbierto} onOpenChange={setCalendarioAbierto}>
            <PopoverPrimitive.Trigger
              aria-label={
                fechaEnTira ? "Elegir otra fecha en el calendario" : `Fecha elegida: ${formatoDiaLargo(fecha)}. Cambiar en el calendario`
              }
              className={cn(
                "flex w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border px-1 py-1.5 text-center text-xs transition-colors",
                "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                fechaEnTira
                  ? "border-dashed border-border bg-card text-muted-foreground hover:border-muted-foreground/60"
                  : "border-primary bg-primary font-semibold text-primary-foreground",
              )}
            >
              <CalendarDays className="size-4" aria-hidden />
              {fechaEnTira ? "Otra fecha…" : formatoDiaCorto(fecha)}
            </PopoverPrimitive.Trigger>
            <PopoverPrimitive.Portal>
              <PopoverPrimitive.Positioner side="bottom" align="end" sideOffset={6} className="isolate z-50">
                <PopoverPrimitive.Popup
                  aria-label="Elegir otra fecha"
                  className="w-72 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg outline-none"
                >
                  <CalendarioMes
                    seleccionada={fecha}
                    hoy={ahora.fecha}
                    permitirPasado={original != null}
                    citasPorDia={(dia) => citasDe(dia).length}
                    onElegir={(dia) => {
                      elegirFecha(dia);
                      setCalendarioAbierto(false);
                    }}
                  />
                </PopoverPrimitive.Popup>
              </PopoverPrimitive.Positioner>
            </PopoverPrimitive.Portal>
          </PopoverPrimitive.Root>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <span id={idHora} className="text-sm font-medium">
          Hora
        </span>
        <div ref={horasRef} className="flex flex-col gap-3">
          {fecha === ahora.fecha && disponibles.length === 0 ? (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              Por hoy ya no quedan horas. Elige otro día o escribe la hora abajo.
            </p>
          ) : null}
          {[
            { titulo: "Mañana", lista: manana },
            { titulo: "Tarde", lista: tarde },
          ].map(({ titulo, lista }) =>
            lista.length ? (
              <div key={titulo} className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">{titulo}</span>
                <div
                  role="radiogroup"
                  aria-label={`Horas de la ${titulo.toLowerCase()}`}
                  aria-invalid={invalid || undefined}
                  className="grid grid-cols-3 gap-1.5 sm:grid-cols-[repeat(auto-fill,minmax(5.75rem,1fr))]"
                >
                  {lista.map(botonHora)}
                </div>
              </div>
            ) : null,
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <label htmlFor={`${id}-hora-escrita`}>¿Otra hora?</label>
          <Input
            id={`${id}-hora-escrita`}
            value={horaEscrita}
            onChange={(evento) => setHoraEscrita(evento.target.value)}
            onKeyDown={(evento) => {
              if (evento.key === "Enter") {
                evento.preventDefault();
                aplicarHoraEscrita();
              }
            }}
            onBlur={aplicarHoraEscrita}
            placeholder="Ej: 10:15 o 3:45 pm"
            autoComplete="off"
            className="w-36"
          />
          {avisoHora ? (
            <span role="status" className={avisoHora.error ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}>
              {avisoHora.texto}
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5 border-t border-border pt-2.5 text-sm">
          {citasDelDia.length ? (
            <>
              <span className="text-muted-foreground">
                {relativo ? capitalizar(relativo) : `El ${formatoDiaCorto(fecha)}`} ya{" "}
                {citasDelDia.length === 1 ? "hay 1 cita" : `hay ${citasDelDia.length} citas`}
                {original ? " (sin contar esta)" : ""}:
              </span>
              <ul className="flex flex-wrap gap-1.5">
                {citasDelDia.map((cita, indice) => (
                  <li
                    key={`${cita.minutos}-${cita.placa}-${indice}`}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md bg-sky-500/10 py-0.5 pr-2 pl-1.5 text-xs",
                      hora != null && cita.minutos >= hora && cita.minutos < hora + paso && "ring-2 ring-sky-600/60",
                    )}
                  >
                    <b className="font-semibold tabular-nums">{formatoHora12(cita.minutos)}</b>
                    <span className="rounded border-2 border-neutral-900 bg-[oklch(0.86_0.17_92)] px-1 font-mono text-[11px] leading-tight font-bold tracking-widest text-neutral-900">
                      {cita.placa}
                    </span>
                    {cita.motivo}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <span className="text-muted-foreground">
              {relativo ? capitalizar(relativo) : `El ${formatoDiaCorto(fecha)}`} no hay citas agendadas todavía.
            </span>
          )}
        </div>
      </div>

      <p
        aria-live="polite"
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-3.5 py-3 text-sm",
          hora != null ? "bg-primary/10" : "bg-muted text-muted-foreground",
        )}
      >
        <Clock className={cn("size-5 shrink-0", hora != null ? "text-primary" : "text-muted-foreground")} aria-hidden />
        {hora != null ? (
          <span>
            La cita queda para{" "}
            <strong>
              {relativo ? `${relativo}, ` : ""}
              {formatoDiaLargo(fecha)}
            </strong>{" "}
            a las <strong>{formatoHora12(hora)}</strong>.
          </span>
        ) : (
          <span>Elegiste {formatoDiaLargo(fecha)}. Falta la hora.</span>
        )}
      </p>
    </div>
  );
}

function CalendarioMes({
  seleccionada,
  hoy,
  permitirPasado,
  citasPorDia,
  onElegir,
}: {
  seleccionada: string;
  hoy: string;
  permitirPasado: boolean;
  citasPorDia: (dia: string) => number;
  onElegir: (dia: string) => void;
}) {
  const [mes, setMes] = useState(seleccionada.slice(0, 7));
  const [foco, setFoco] = useState(seleccionada);
  const gridRef = useRef<HTMLTableElement>(null);
  const deshabilitado = (dia: string) => !permitirPasado && dia < hoy;
  const puedeRetroceder = permitirPasado || mes > hoy.slice(0, 7);

  const desfase = diaSemana(`${mes}-01`);
  const total = diasDelMes(mes);
  const celdas: (string | null)[] = [
    ...Array.from({ length: desfase }, () => null),
    ...Array.from({ length: total }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`),
  ];
  while (celdas.length % 7) celdas.push(null);
  const semanas = Array.from({ length: celdas.length / 7 }, (_, i) => celdas.slice(i * 7, i * 7 + 7));
  const focoEnMes = foco.startsWith(mes) ? foco : seleccionada.startsWith(mes) ? seleccionada : hoy.startsWith(mes) ? hoy : `${mes}-01`;

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
          onClick={() => cambiarMes(1)}
          className="grid size-7 place-items-center rounded-md border border-border"
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
              {semana.map((dia, j) =>
                dia ? (
                  <td key={dia} role="gridcell" aria-selected={dia === seleccionada} className="p-px text-center">
                    <button
                      type="button"
                      data-dia={dia}
                      aria-current={dia === hoy ? "date" : undefined}
                      aria-label={`${formatoDiaLargo(dia)}${dia === hoy ? " (hoy)" : ""}${citasPorDia(dia) ? `, ya hay ${nCitas(citasPorDia(dia))}` : ""}`}
                      tabIndex={dia === focoEnMes ? 0 : -1}
                      disabled={deshabilitado(dia)}
                      onClick={() => onElegir(dia)}
                      onKeyDown={(evento) => tecla(evento, dia)}
                      className={cn(
                        "relative aspect-square w-full rounded-md text-sm tabular-nums",
                        "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                        "disabled:cursor-default disabled:opacity-35",
                        dia === seleccionada ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                        dia === hoy && dia !== seleccionada && "font-bold text-primary",
                      )}
                    >
                      {Number(dia.slice(8))}
                      {citasPorDia(dia) ? (
                        <span
                          className={cn(
                            "absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full",
                            dia === seleccionada ? "bg-primary-foreground" : PUNTO_OCUPACION,
                          )}
                        />
                      ) : null}
                    </button>
                  </td>
                ) : (
                  <td key={`vacio-${j}`} />
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <i className={cn("size-1.5 rounded-full", PUNTO_OCUPACION)} /> ya hay citas ese día
      </span>
    </div>
  );
}

/** Flechas, Inicio y Fin dentro de un grupo de botones tipo radio. */
function moverIndice(tecla: string, indice: number, total: number): number | null {
  if (tecla === "ArrowRight" || tecla === "ArrowDown") return Math.min(indice + 1, total - 1);
  if (tecla === "ArrowLeft" || tecla === "ArrowUp") return Math.max(indice - 1, 0);
  if (tecla === "Home") return 0;
  if (tecla === "End") return total - 1;
  return null;
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
