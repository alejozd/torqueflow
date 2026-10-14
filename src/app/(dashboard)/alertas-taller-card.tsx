import Link from "next/link";
import { CarFront, CircleCheck, Hourglass } from "lucide-react";
import type { AlertaTaller } from "@/app/actions/alertas-taller-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ETIQUETA_PRIORIDAD, type MotivoAlerta } from "@/lib/orden/flujo";
import { cn } from "@/lib/utils";
import { ETIQUETA_FILTRO_ALERTA, construirHrefOrdenes } from "./ordenes/filtros-ordenes";
import { PRIORIDAD_BADGE_CLASSNAME } from "./ordenes/prioridad-tono";

/** Filas visibles en el Inicio; el resto se ve en /ordenes con el filtro (D8). */
const MAX_FILAS = 5;

// Mismos tonos de chip que la tarjeta vecina de alertas de inventario.
const MOTIVO: Record<MotivoAlerta, { fila: string; chip: string; icon: typeof Hourglass }> = {
  ESTANCADA: {
    fila: "Estancada",
    chip: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    icon: Hourglass,
  },
  TERMINADA_SIN_ENTREGAR: {
    fila: "Sin entregar",
    chip: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    icon: CarFront,
  },
};

const MOTIVOS: MotivoAlerta[] = ["ESTANCADA", "TERMINADA_SIN_ENTREGAR"];

/**
 * Alertas del taller (Fase 22, D7; rediseño D8 de la consolidación): lo que se
 * quedó parado y lo que está listo sin entregar. Cabecera con un contador por
 * motivo que lleva a su filtro en /ordenes, y como mucho cinco filas en el
 * orden de la acción (prioridad, luego días). Es un componente de servidor: la
 * orden sale de la alerta sola cuando se mueve o se le carga trabajo.
 */
export function AlertasTallerCard({ diasUmbral, alertas }: { diasUmbral: number; alertas: AlertaTaller[] }) {
  const conteo: Record<MotivoAlerta, number> = { ESTANCADA: 0, TERMINADA_SIN_ENTREGAR: 0 };
  for (const alerta of alertas) conteo[alerta.motivo] += 1;
  const visibles = alertas.slice(0, MAX_FILAS);
  const motivosPresentes = MOTIVOS.filter((motivo) => conteo[motivo] > 0);

  return (
    <Card id="alertas-taller" className="scroll-mt-16 gap-0 overflow-hidden py-0">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 py-4">
        <CardTitle className="flex items-center gap-2">
          Alertas del taller
          {alertas.length > 0 ? (
            <span className="rounded-full bg-red-50 px-2 text-xs font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">
              {alertas.length}
            </span>
          ) : null}
        </CardTitle>
        <span className="text-xs text-muted-foreground">Sin actividad en {diasUmbral} días o más</span>
      </CardHeader>

      {alertas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 border-t px-4 py-10 text-center">
          <CircleCheck className="size-8 text-green-600 dark:text-green-400" />
          <p className="text-sm font-medium">Todo en movimiento</p>
          <p className="text-sm text-muted-foreground">
            Ninguna orden estancada ni terminada sin entregar.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 px-4 pb-4">
            {MOTIVOS.map((motivo) => {
              const Icono = MOTIVO[motivo].icon;
              return (
                <Link
                  key={motivo}
                  href={construirHrefOrdenes({ alerta: motivo })}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    conteo[motivo] > 0 ? MOTIVO[motivo].chip : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icono className="size-4 shrink-0" aria-hidden />
                  <span className="font-semibold tabular-nums">{conteo[motivo]}</span> {ETIQUETA_FILTRO_ALERTA[motivo]}
                </Link>
              );
            })}
          </div>

          <ul className="divide-y border-t">
            {visibles.map((alerta) => (
              <li key={alerta.ordenId}>
                <Link
                  href={`/ordenes/${alerta.ordenId}`}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
                >
                  <span className="shrink-0 font-mono font-medium">{alerta.placa}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{alerta.cliente}</span>
                  {alerta.prioridad !== "NORMAL" ? (
                    <Badge
                      variant="outline"
                      className={cn("shrink-0 text-[10px]", PRIORIDAD_BADGE_CLASSNAME[alerta.prioridad])}
                    >
                      {ETIQUETA_PRIORIDAD[alerta.prioridad]}
                    </Badge>
                  ) : null}
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs whitespace-nowrap",
                      MOTIVO[alerta.motivo].chip,
                    )}
                  >
                    {MOTIVO[alerta.motivo].fila}
                  </span>
                  <span className="w-14 shrink-0 text-right text-xs font-medium whitespace-nowrap tabular-nums">
                    {alerta.dias} {alerta.dias === 1 ? "día" : "días"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {alertas.length > MAX_FILAS ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                Mostrando {MAX_FILAS} de {alertas.length}
              </span>
              {motivosPresentes.length === 1 ? (
                <Link
                  href={construirHrefOrdenes({ alerta: motivosPresentes[0] })}
                  className="text-primary hover:underline"
                >
                  Ver todas
                </Link>
              ) : (
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-muted-foreground">Ver todas:</span>
                  {motivosPresentes.map((motivo) => (
                    <Link
                      key={motivo}
                      href={construirHrefOrdenes({ alerta: motivo })}
                      aria-label={`Ver todas las ${ETIQUETA_FILTRO_ALERTA[motivo].toLowerCase()}`}
                      className="text-primary hover:underline"
                    >
                      {ETIQUETA_FILTRO_ALERTA[motivo]} ({conteo[motivo]})
                    </Link>
                  ))}
                </span>
              )}
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}
