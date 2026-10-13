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
import { ETIQUETA_DANIO, LIENZO, etiquetaZona, zonasDe } from "@/lib/danos/figuras";
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
 * se marca qué tiene y, si hace falta, una nota. Las marcas se listan debajo con
 * su opción de quitar.
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
  const zonas = zonasDe(tipoVehiculo);
  const [zona, setZona] = useState<ZonaVehiculo>(zonas[0]!.zona);
  const [tipo, setTipo] = useState<TipoDanio>("GOLPE");
  const [nota, setNota] = useState("");

  const marcadas = new Map<ZonaVehiculo, DanioVista[]>();
  for (const danio of danios) {
    marcadas.set(danio.zona, [...(marcadas.get(danio.zona) ?? []), danio]);
  }

  const opcionesZona = [
    ...zonas.map((figura) => ({ value: figura.zona, label: figura.etiqueta })),
    { value: "OTRO", label: "Otra zona" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <svg
        viewBox={`0 0 ${LIENZO.ancho} ${LIENZO.alto}`}
        role="group"
        aria-label="Diagrama de daños del vehículo"
        className="w-full max-w-xl self-start rounded-md border border-border bg-muted/20"
      >
        {zonas.map((figura) => {
          const seleccionada = zona === figura.zona;
          const tieneMarca = marcadas.has(figura.zona);
          return (
            <path
              key={figura.zona}
              d={figura.d}
              role="button"
              tabIndex={soloLectura ? -1 : 0}
              aria-label={`${figura.etiqueta}${tieneMarca ? " (con daño marcado)" : ""}`}
              aria-pressed={seleccionada}
              className={cn(
                "stroke-border transition-colors",
                tieneMarca ? "fill-destructive/40" : "fill-background hover:fill-primary/20",
                seleccionada && "fill-primary/30 stroke-primary",
                soloLectura ? "cursor-default" : "cursor-pointer",
              )}
              onClick={() => {
                if (!soloLectura) setZona(figura.zona);
              }}
              onKeyDown={(evento) => {
                if (soloLectura) return;
                if (evento.key === "Enter" || evento.key === " ") {
                  evento.preventDefault();
                  setZona(figura.zona);
                }
              }}
            />
          );
        })}
      </svg>

      {soloLectura ? null : (
        <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3">
          <input type="hidden" name="zona" value={zona} />
          <div className="flex min-w-44 flex-col gap-1.5">
            <Label htmlFor="danio-zona">Zona</Label>
            <SelectField
              id="danio-zona"
              items={opcionesZona}
              value={zona}
              onValueChange={(valor) => setZona(valor as ZonaVehiculo)}
            />
          </div>
          <div className="flex min-w-36 flex-col gap-1.5">
            <Label htmlFor="danio-tipo">Qué tiene</Label>
            <SelectField
              id="danio-tipo"
              items={TIPOS}
              value={tipo}
              onValueChange={(valor) => setTipo(valor as TipoDanio)}
            />
          </div>
          <input type="hidden" name="tipo" value={tipo} />
          <div className="flex min-w-52 flex-1 flex-col gap-1.5">
            <Label htmlFor="danio-nota">Nota (opcional)</Label>
            <Input id="danio-nota" name="nota" value={nota} maxLength={200} onChange={(evento) => setNota(evento.target.value)} />
          </div>
          <Button type="submit" size="sm" disabled={isPending}>
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
        <ul className="flex flex-col gap-1.5">
          {danios.map((danio) => (
            <li key={danio.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
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
  );
}
