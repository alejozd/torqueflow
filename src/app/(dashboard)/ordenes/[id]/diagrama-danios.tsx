"use client";

import { useActionState, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { agregarDanioAction, quitarDanioAction, type RecepcionFormState } from "@/app/actions/recepcion-actions";
import { QuitarConConfirmacion } from "@/components/quitar-con-confirmacion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  COLOR_DANIO,
  ETIQUETA_DANIO,
  FIGURAS,
  centroDe,
  etiquetaZona,
  figuraDe,
  type TipoTrazo,
} from "@/lib/danos/figuras";
import type { TipoDanio, ZonaVehiculo } from "@/generated/prisma-tenant";

const initialState: RecepcionFormState = { error: null, success: false };

const TIPOS = Object.keys(ETIQUETA_DANIO) as TipoDanio[];

/** Color de cada trazo del dibujo (decorado: no se toca ni lo lee el lector de pantalla). */
const ESTILO_TRAZO: Record<TipoTrazo, { className: string; ancho: number }> = {
  carroceria: { className: "fill-card stroke-[oklch(0.62_0.03_250)]", ancho: 2.2 },
  vidrio: { className: "fill-[oklch(0.93_0.02_240)] stroke-[oklch(0.7_0.03_250)]", ancho: 1.6 },
  llanta: { className: "fill-[oklch(0.32_0.01_250)] stroke-none", ancho: 0 },
  rin: { className: "fill-[oklch(0.85_0.02_250)] stroke-[oklch(0.62_0.03_250)]", ancho: 1.4 },
  espejo: { className: "fill-[oklch(0.85_0.02_250)] stroke-[oklch(0.62_0.03_250)]", ancho: 1.4 },
  linea: { className: "fill-none stroke-[oklch(0.82_0.02_250)]", ancho: 1.3 },
  farola: { className: "fill-none stroke-[oklch(0.75_0.12_85)] [stroke-linecap:round]", ancho: 4 },
  stop: { className: "fill-none stroke-[oklch(0.6_0.18_25)] [stroke-linecap:round]", ancho: 4 },
};

export interface DanioVista {
  id: string;
  zona: ZonaVehiculo;
  tipo: TipoDanio;
  nota: string | null;
}

/**
 * Croquis de daños: el dibujo del vehículo con sus zonas encima (datos de
 * `figuras.ts`) y un número por cada daño, el mismo de su tarjeta. Nada viene
 * elegido: tocar una zona abre el formulario, así no se marca «Frente» por descuido.
 */
export function DiagramaDanios({
  ordenId,
  tipoVehiculo,
  danios,
  soloLectura,
  puedeQuitar,
}: {
  ordenId: string;
  tipoVehiculo: string;
  danios: DanioVista[];
  soloLectura: boolean;
  puedeQuitar: boolean;
}) {
  const agregar = agregarDanioAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(agregar, initialState);
  const figura = FIGURAS[figuraDe(tipoVehiculo)];
  const [zona, setZona] = useState<ZonaVehiculo | null>(null);
  const [tipo, setTipo] = useState<TipoDanio>("GOLPE");
  const [nota, setNota] = useState("");
  const [activo, setActivo] = useState<string | null>(null);
  const zonasRef = useRef<(SVGPathElement | null)[]>([]);

  // Tras marcar con éxito se cierra el formulario (ajuste de estado durante el render).
  const [ultimoEstado, setUltimoEstado] = useState(state);
  if (state !== ultimoEstado) {
    setUltimoEstado(state);
    if (state.success) {
      setZona(null);
      setNota("");
    }
  }

  const zonasDibujadas = new Map(figura.zonas.map((zonaFigura) => [zonaFigura.zona, zonaFigura]));
  const vistosPorZona = new Map<ZonaVehiculo, number>();
  const marcadores = danios.flatMap((danio, indice) => {
    const enDibujo = zonasDibujadas.get(danio.zona);
    const posicion = enDibujo ? centroDe(enDibujo) : figura.fueraDelDibujo?.[danio.zona];
    if (!posicion) return [];
    const repetido = vistosPorZona.get(danio.zona) ?? 0;
    vistosPorZona.set(danio.zona, repetido + 1);
    return [
      {
        danio,
        numero: indice + 1,
        x: posicion.x + repetido * 14,
        y: posicion.y - repetido * 10,
        viejo: !enDibujo,
      },
    ];
  });

  function moverCon(evento: KeyboardEvent<SVGPathElement>, indice: number) {
    const total = figura.zonas.length;
    const paso =
      evento.key === "ArrowRight" || evento.key === "ArrowDown"
        ? 1
        : evento.key === "ArrowLeft" || evento.key === "ArrowUp"
          ? -1
          : 0;
    if (paso !== 0) {
      evento.preventDefault();
      const siguiente = (indice + paso + total) % total;
      setZona(figura.zonas[siguiente]!.zona);
      zonasRef.current[siguiente]?.focus();
    } else if (evento.key === "Enter" || evento.key === " ") {
      evento.preventDefault();
      setZona(figura.zonas[indice]!.zona);
    }
  }

  const indiceConFoco = Math.max(
    0,
    figura.zonas.findIndex((zonaFigura) => zonaFigura.zona === zona),
  );

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
      <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-muted/30 p-3">
        <svg viewBox={`0 0 ${figura.lienzo.ancho} ${figura.lienzo.alto}`} className="w-full max-w-[280px]">
          <g aria-hidden className="pointer-events-none">
            {figura.silueta.map((trazo, indice) => (
              <path
                key={indice}
                d={trazo.d}
                className={ESTILO_TRAZO[trazo.tipo].className}
                strokeWidth={ESTILO_TRAZO[trazo.tipo].ancho}
              />
            ))}
          </g>

          <g role="radiogroup" aria-label={`Zonas del vehículo: ${figura.titulo}`}>
            {figura.zonas.map((zonaFigura, indice) => {
              const elegida = zona === zonaFigura.zona;
              return (
                <path
                  key={zonaFigura.zona}
                  ref={(nodo) => {
                    zonasRef.current[indice] = nodo;
                  }}
                  d={zonaFigura.d}
                  role="radio"
                  aria-checked={elegida}
                  aria-disabled={soloLectura || undefined}
                  aria-label={
                    zonaFigura.detalle ? `${zonaFigura.etiqueta} (${zonaFigura.detalle})` : zonaFigura.etiqueta
                  }
                  tabIndex={!soloLectura && indice === indiceConFoco ? 0 : -1}
                  strokeWidth={elegida ? 2 : 1}
                  className={cn(
                    "outline-none transition-colors",
                    elegida
                      ? "fill-primary/25 stroke-primary"
                      : "fill-transparent stroke-[oklch(0.7_0.02_250/0.35)] [stroke-dasharray:3_3]",
                    !soloLectura &&
                      !elegida &&
                      "cursor-pointer hover:fill-primary/15 hover:stroke-primary hover:[stroke-dasharray:none] focus-visible:fill-primary/15 focus-visible:stroke-primary",
                  )}
                  onClick={() => {
                    if (!soloLectura) setZona(zonaFigura.zona);
                  }}
                  onKeyDown={(evento) => {
                    if (!soloLectura) moverCon(evento, indice);
                  }}
                >
                  <title>{zonaFigura.etiqueta}</title>
                </path>
              );
            })}
          </g>

          <g aria-hidden>
            {marcadores.map((marcador) => (
              <g
                key={marcador.danio.id}
                data-marcador={marcador.numero}
                data-activo={activo === marcador.danio.id ? "true" : undefined}
                transform={`translate(${marcador.x} ${marcador.y})`}
                className="cursor-default"
                onMouseEnter={() => setActivo(marcador.danio.id)}
                onMouseLeave={() => setActivo(null)}
              >
                <circle
                  r={activo === marcador.danio.id ? 17 : 14}
                  className={marcador.viejo ? "fill-muted-foreground/20" : "fill-destructive/20"}
                />
                <circle r={10} className={marcador.viejo ? "fill-muted-foreground" : "fill-destructive"} />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={11}
                  className="pointer-events-none fill-white font-semibold"
                >
                  {marcador.numero}
                </text>
              </g>
            ))}
          </g>

          <g aria-hidden className="pointer-events-none select-none">
            {figura.orientacion.map((rotulo) => (
              <text
                key={rotulo.texto}
                x={rotulo.x}
                y={rotulo.y}
                textAnchor={rotulo.ancla}
                fontSize={11}
                className="fill-muted-foreground font-semibold tracking-wide"
              >
                {rotulo.texto}
              </text>
            ))}
          </g>
        </svg>
        {soloLectura ? null : (
          <>
            <p className="text-center text-xs text-muted-foreground">Toca una zona del dibujo para marcar un daño.</p>
            <Button type="button" variant="ghost" size="xs" onClick={() => setZona("OTRO")}>
              Otra zona (no está en el dibujo)
            </Button>
          </>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Daños al recibir</p>
          {danios.length > 0 ? (
            <p className="text-xs text-muted-foreground">Pasa el mouse por un daño para ubicarlo.</p>
          ) : null}
        </div>

        {zona && !soloLectura ? (
          <form
            action={formAction}
            aria-label={`Nuevo daño en ${etiquetaZona(zona).toLowerCase()}`}
            className="flex flex-col gap-2.5 rounded-xl border border-primary/40 bg-primary/5 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Nuevo daño en {etiquetaZona(zona).toLowerCase()}</p>
              <Button type="button" variant="ghost" size="icon-xs" aria-label="Cancelar" onClick={() => setZona(null)}>
                <X />
              </Button>
            </div>
            <input type="hidden" name="zona" value={zona} />
            <input type="hidden" name="tipo" value={tipo} />
            <div role="radiogroup" aria-label="Qué tiene" className="flex flex-wrap gap-1.5">
              {TIPOS.map((opcion) => (
                <button
                  key={opcion}
                  type="button"
                  role="radio"
                  aria-checked={tipo === opcion}
                  onClick={() => setTipo(opcion)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                    tipo === opcion
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card hover:bg-muted",
                  )}
                >
                  <span className="size-1.5 shrink-0 rounded-full" style={{ background: COLOR_DANIO[opcion] }} />
                  {ETIQUETA_DANIO[opcion]}
                </button>
              ))}
            </div>
            <Input
              name="nota"
              aria-label="Nota (opcional)"
              value={nota}
              maxLength={200}
              placeholder="Nota (opcional): tamaño, ubicación exacta…"
              onChange={(evento) => setNota(evento.target.value)}
            />
            <Button type="submit" size="sm" disabled={isPending} className="self-end">
              {isPending ? "Marcando..." : "Marcar daño"}
            </Button>
          </form>
        ) : null}

        {state.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}

        {danios.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin daños marcados.</p>
        ) : (
          <ol aria-label="Daños marcados" className="flex flex-col gap-2">
            {danios.map((danio, indice) => {
              const viejo = zonasDibujadas.has(danio.zona) ? undefined : figura.fueraDelDibujo?.[danio.zona];
              return (
                <li
                  key={danio.id}
                  onMouseEnter={() => setActivo(danio.id)}
                  onMouseLeave={() => setActivo(null)}
                  className={cn(
                    "flex gap-3 rounded-xl border bg-card p-3 transition-shadow",
                    activo === danio.id ? "border-destructive ring-3 ring-destructive/15" : "border-border",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                      viejo ? "bg-muted text-muted-foreground" : "bg-destructive/15 text-destructive",
                    )}
                  >
                    {indice + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{etiquetaZona(danio.zona)}</span>
                      <Badge variant="outline" className="gap-1.5">
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ background: COLOR_DANIO[danio.tipo] }}
                        />
                        {ETIQUETA_DANIO[danio.tipo]}
                      </Badge>
                    </div>
                    {danio.nota ? <p className="mt-1 text-sm text-muted-foreground">{danio.nota}</p> : null}
                    {viejo ? (
                      <p className="mt-1.5 inline-block rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                        {viejo.aviso}
                      </p>
                    ) : null}
                  </div>
                  {puedeQuitar && !soloLectura ? (
                    <QuitarConConfirmacion
                      etiqueta={`Quitar ${etiquetaZona(danio.zona)}`}
                      pregunta={`¿Quitar la marca de ${etiquetaZona(danio.zona)}?`}
                      accion={quitarDanioAction.bind(null, danio.id)}
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
