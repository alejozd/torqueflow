"use client";

import { useActionState, useState } from "react";
import { agregarDanioAction, quitarDanioAction, type RecepcionFormState } from "@/app/actions/recepcion-actions";
import { QuitarConConfirmacion } from "@/components/quitar-con-confirmacion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { cn } from "@/lib/utils";
import { ETIQUETA_DANIO, FIGURAS, centroDe, etiquetaZona, figuraDe } from "@/lib/danos/figuras";
import type { TipoDanio, ZonaVehiculo } from "@/generated/prisma-tenant";

const initialState: RecepcionFormState = { error: null, success: false };

const TIPOS: { value: TipoDanio; label: string }[] = (Object.keys(ETIQUETA_DANIO) as TipoDanio[]).map((tipo) => ({
  value: tipo,
  label: ETIQUETA_DANIO[tipo],
}));

export interface DanioVista {
  id: string;
  zona: ZonaVehiculo;
  tipo: TipoDanio;
  nota: string | null;
}

/**
 * Diagrama de daños (D2): se toca la zona en la silueta (o se elige en la lista),
 * se marca qué tiene y, si hace falta, una nota. La figura muestra la silueta del
 * vehículo, hacia dónde mira, el nombre de las zonas grandes y cuántos daños
 * tiene cada una; las marcas se listan al lado con su opción de quitar.
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
  const [zona, setZona] = useState<ZonaVehiculo>(figura.zonas[0]!.zona);
  const [tipo, setTipo] = useState<TipoDanio>("GOLPE");
  const [nota, setNota] = useState("");

  const marcadas = new Map<ZonaVehiculo, DanioVista[]>();
  for (const danio of danios) {
    marcadas.set(danio.zona, [...(marcadas.get(danio.zona) ?? []), danio]);
  }

  const opcionesZona = [
    ...figura.zonas.map((zonaFigura) => ({ value: zonaFigura.zona, label: zonaFigura.etiqueta })),
    { value: "OTRO", label: "Otra zona" },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
      <div className="flex flex-col gap-2">
        <svg
          viewBox={`0 0 ${figura.lienzo.ancho} ${figura.lienzo.alto}`}
          role="group"
          aria-label={`Diagrama de daños del vehículo: ${figura.titulo}`}
          className="mx-auto w-full max-w-[300px] rounded-lg border border-border bg-muted/30 p-2"
        >
          {figura.silueta.map((trazo, indice) => (
            <path key={indice} d={trazo} aria-hidden className="fill-muted stroke-muted-foreground/40" strokeWidth={1.5} />
          ))}

          {figura.zonas.map((zonaFigura) => {
            const seleccionada = !soloLectura && zona === zonaFigura.zona;
            const cantidad = marcadas.get(zonaFigura.zona)?.length ?? 0;
            return (
              <path
                key={zonaFigura.zona}
                d={zonaFigura.d}
                role="button"
                tabIndex={soloLectura ? -1 : 0}
                aria-label={`${zonaFigura.etiqueta}${cantidad > 0 ? " (con daño marcado)" : ""}`}
                aria-pressed={seleccionada}
                strokeWidth={seleccionada ? 2 : 1}
                className={cn(
                  "transition-colors outline-none focus-visible:stroke-ring",
                  cantidad > 0 ? "fill-destructive/20 stroke-destructive" : "fill-card stroke-muted-foreground/50",
                  !soloLectura && cantidad === 0 && "hover:fill-primary/15",
                  seleccionada && "fill-primary/25 stroke-primary",
                  soloLectura ? "cursor-default" : "cursor-pointer",
                )}
                onClick={() => {
                  if (!soloLectura) setZona(zonaFigura.zona);
                }}
                onKeyDown={(evento) => {
                  if (soloLectura) return;
                  if (evento.key === "Enter" || evento.key === " ") {
                    evento.preventDefault();
                    setZona(zonaFigura.zona);
                  }
                }}
              >
                <title>{zonaFigura.detalle ? `${zonaFigura.etiqueta} (${zonaFigura.detalle})` : zonaFigura.etiqueta}</title>
              </path>
            );
          })}

          {/* Rótulos y contadores encima de las zonas, sin capturar el clic. */}
          <g aria-hidden className="pointer-events-none select-none">
            {figura.zonas.map((zonaFigura) => {
              const { x, y } = centroDe(zonaFigura);
              const cantidad = marcadas.get(zonaFigura.zona)?.length ?? 0;
              const [, , ancho, alto] = zonaFigura.cajas[0]!;
              const vertical = alto > ancho * 2;
              return (
                <g key={zonaFigura.zona}>
                  {zonaFigura.rotulo ? (
                    <text
                      x={x}
                      y={y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={10}
                      transform={vertical ? `rotate(-90 ${x} ${y})` : undefined}
                      className="fill-muted-foreground font-medium"
                    >
                      {zonaFigura.rotulo}
                    </text>
                  ) : null}
                  {cantidad > 0 ? (
                    <g transform={`translate(${x} ${zonaFigura.rotulo && !vertical ? y - 16 : y})`}>
                      <circle r={8} className="fill-destructive" />
                      <text textAnchor="middle" dominantBaseline="central" fontSize={10} className="fill-white font-semibold">
                        {cantidad}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })}
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

        <ul aria-label="Leyenda del diagrama" className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {soloLectura ? null : (
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="size-3 rounded-sm border-2 border-primary bg-primary/25" /> Zona elegida
            </li>
          )}
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="size-3 rounded-sm border border-destructive bg-destructive/20" /> Con daño (el número es cuántos)
          </li>
        </ul>
        {soloLectura ? null : (
          <p className="text-center text-xs text-muted-foreground">Toca una zona del dibujo para elegirla.</p>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {soloLectura ? null : (
          <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <p className="text-sm">
              Zona elegida: <span className="font-semibold">{etiquetaZona(zona)}</span>
            </p>
            <input type="hidden" name="zona" value={zona} />
            <input type="hidden" name="tipo" value={tipo} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="danio-zona">Zona</Label>
                <SelectField
                  id="danio-zona"
                  items={opcionesZona}
                  value={zona}
                  onValueChange={(valor) => setZona(valor as ZonaVehiculo)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="danio-tipo">Qué tiene</Label>
                <SelectField
                  id="danio-tipo"
                  items={TIPOS}
                  value={tipo}
                  onValueChange={(valor) => setTipo(valor as TipoDanio)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="danio-nota">Nota (opcional)</Label>
              <Input
                id="danio-nota"
                name="nota"
                value={nota}
                maxLength={200}
                placeholder="Ej.: rayón de 10 cm cerca de la manija"
                onChange={(evento) => setNota(evento.target.value)}
              />
            </div>
            <Button type="submit" size="sm" disabled={isPending} className="self-start">
              {isPending ? "Marcando..." : "Marcar daño"}
            </Button>
          </form>
        )}

        {state.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}

        {danios.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin daños marcados.</p>
        ) : (
          <ul aria-label="Daños marcados" className="flex flex-col gap-1.5">
            {danios.map((danio) => (
              <li key={danio.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <span aria-hidden className="size-2 shrink-0 rounded-full bg-destructive" />
                <span className="font-medium">{etiquetaZona(danio.zona)}</span>
                <span className="text-muted-foreground">{ETIQUETA_DANIO[danio.tipo]}</span>
                {danio.nota ? <span className="text-xs text-muted-foreground">· {danio.nota}</span> : null}
                {puedeQuitar && !soloLectura ? (
                  <span className="ml-auto">
                    <QuitarConConfirmacion
                      etiqueta={`Quitar ${etiquetaZona(danio.zona)}`}
                      pregunta={`¿Quitar la marca de ${etiquetaZona(danio.zona)}?`}
                      accion={quitarDanioAction.bind(null, danio.id)}
                    />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
