import type { EstadoOrden } from "@/generated/prisma-tenant";
import { cn } from "@/lib/utils";
import { ESTADO_DOT_COLOR } from "../estado-tono";

const PASOS: { estado: EstadoOrden; titulo: string; detalle: string }[] = [
  { estado: "BORRADOR", titulo: "Borrador", detalle: "Recepción, daños y cotización" },
  { estado: "EN_PROCESO", titulo: "En proceso", detalle: "El mecánico trabaja" },
  { estado: "TERMINADA", titulo: "Terminada", detalle: "Lista para entregar" },
  { estado: "ENTREGADA", titulo: "Entregada", detalle: "Acta firmada" },
];

/**
 * En qué momento va la orden, en CSS puro. No lleva botón: avanzar se hace desde
 * la cabecera, para que no haya dos lugares que hagan lo mismo.
 */
export function CicloOrden({ estado }: { estado: EstadoOrden }) {
  if (estado === "ANULADA") {
    return (
      <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
        La orden está anulada: ya no avanza.
      </p>
    );
  }
  const actual = PASOS.findIndex((paso) => paso.estado === estado);
  const color = ESTADO_DOT_COLOR[estado];

  return (
    <ol aria-label="Ciclo de la orden" className="flex flex-col">
      {PASOS.map((paso, indice) => {
        const fase = indice < actual ? "hecho" : indice === actual ? "actual" : "pendiente";
        return (
          <li
            key={paso.estado}
            data-fase={fase}
            aria-current={fase === "actual" ? "step" : undefined}
            className="relative flex gap-2.5 pb-3.5 last:pb-0"
          >
            {indice < PASOS.length - 1 ? (
              <span aria-hidden className="absolute top-4 bottom-0 left-[6px] w-0.5 bg-border" />
            ) : null}
            <span
              aria-hidden
              className={cn(
                "relative z-10 mt-0.5 size-3.5 shrink-0 rounded-full border-2",
                fase === "hecho" && "border-[oklch(0.4_0.1_150)] bg-[oklch(0.4_0.1_150)]",
                fase === "pendiente" && "border-border bg-card",
              )}
              style={
                fase === "actual"
                  ? {
                      background: color,
                      borderColor: color,
                      boxShadow: `0 0 0 4px color-mix(in oklch, ${color} 22%, transparent)`,
                    }
                  : undefined
              }
            />
            <div>
              <p
                className={cn(
                  "text-sm",
                  fase === "actual" && "font-semibold",
                  fase === "pendiente" && "text-muted-foreground",
                )}
              >
                {paso.titulo}
              </p>
              <p className="text-xs text-muted-foreground">{paso.detalle}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
