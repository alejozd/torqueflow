import Link from "next/link";
import { Clock } from "lucide-react";
import type { AlertaTaller } from "@/app/actions/alertas-taller-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ETIQUETA_PRIORIDAD } from "@/lib/orden/flujo";
import { cn } from "@/lib/utils";
import { PRIORIDAD_BADGE_CLASSNAME } from "./ordenes/prioridad-tono";

/**
 * Alertas del taller (Fase 22, D7): lo que se quedó parado y lo que está listo
 * sin entregar. Es un componente de servidor: la orden sale de la alerta sola
 * cuando se mueve o se le carga trabajo, así que no hace falta posponer nada.
 */
export function AlertasTallerCard({ diasUmbral, alertas }: { diasUmbral: number; alertas: AlertaTaller[] }) {
  return (
    <Card id="alertas-taller" className="scroll-mt-16">
      <CardHeader>
        <CardTitle>
          Alertas del taller{" "}
          <span className="font-normal text-muted-foreground">
            · {alertas.length} {alertas.length === 1 ? "orden" : "órdenes"}
          </span>
        </CardTitle>
        <CardAction>
          <span className="text-xs text-muted-foreground">Sin actividad en {diasUmbral} días o más</span>
        </CardAction>
      </CardHeader>
      <CardContent>
        {alertas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ninguna orden estancada ni terminada sin entregar. Todo el trabajo está en movimiento.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {alertas.map((alerta) => (
              <li key={alerta.ordenId}>
                <Link
                  href={`/ordenes/${alerta.ordenId}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-accent/50"
                >
                  <Badge
                    variant="outline"
                    className="gap-1 border-transparent bg-destructive/10 text-destructive"
                  >
                    <Clock className="size-3 shrink-0" />
                    {alerta.dias} {alerta.dias === 1 ? "día" : "días"}
                  </Badge>
                  <span className="font-mono text-sm font-medium">{alerta.placa}</span>
                  <span className="text-muted-foreground">{alerta.cliente}</span>
                  <Badge variant="outline" className={cn("text-[10px]", PRIORIDAD_BADGE_CLASSNAME[alerta.prioridad])}>
                    {ETIQUETA_PRIORIDAD[alerta.prioridad]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {alerta.motivo === "ESTANCADA" ? "Estancada en proceso" : "Terminada sin entregar"}
                    {alerta.mecanico ? ` · ${alerta.mecanico}` : " · sin mecánico"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
