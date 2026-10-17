"use client";

import { useState, useTransition, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, MoreHorizontal, Truck } from "lucide-react";
import { toast } from "sonner";
import { updateEstadoOrdenAction, type EstadoFormState } from "@/app/actions/orden-actions";
import { ConfirmacionEnLinea } from "@/components/confirmacion-en-linea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  ESTADO_DOT_COLOR,
  ESTADO_LABELS,
  destinosArrastrables,
  ofreceMenu,
  puedeAnular,
  puedeEntregar,
  requiereConfirmacion,
} from "./estado-tono";
import { PrioridadBadge } from "./prioridad-badge";
import { type MotivoAlerta } from "@/lib/orden/flujo";
import { ESTADO_ORDEN_TRANSITIONS } from "@/lib/orden/estado-transitions";
import type { EstadoOrden, PrioridadOrden } from "@/generated/prisma-tenant";

const initialState: EstadoFormState = { error: null, advertencia: null };

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export interface TarjetaTablero {
  id: string;
  estado: EstadoOrden;
  prioridad: PrioridadOrden;
  placa: string;
  sintomas: string | null;
  cliente: string;
  mecanico: string | null;
  total: number;
  /** Se puede mover: la orden sigue siendo editable. */
  movible: boolean;
  alertaDias: number | null;
  alertaMotivo: MotivoAlerta | null;
}

export interface ColumnaTablero {
  estado: EstadoOrden;
  ordenes: TarjetaTablero[];
}

/**
 * Tablero del taller (Fase 22, D8-D11): arrastrar una tarjeta a otra columna o
 * usar el menú "Mover a…" mueve la orden de estado llamando a la MISMA acción del
 * cambio de estado (nada de caminos de escritura nuevos). A `Entregada` no se
 * suelta ni se elige: se entrega desde el acta, así que la tarjeta de una orden
 * terminada ofrece ese enlace. Anular tampoco se arrastra (es destructivo): pasa
 * por el menú, con confirmación.
 */
export function TableroOrdenes({
  columnas,
  puedeAnularOrdenes,
}: {
  columnas: ColumnaTablero[];
  /** Sin `ordenes.anular` no se ofrece anular. Obligatoria: olvidarla no la deja abierta. */
  puedeAnularOrdenes: boolean;
}) {
  const [arrastrando, setArrastrando] = useState<TarjetaTablero | null>(null);
  const [sobreColumna, setSobreColumna] = useState<EstadoOrden | null>(null);
  const [confirmando, setConfirmando] = useState<{ tarjeta: TarjetaTablero; destino: EstadoOrden } | null>(null);
  const [pendiente, startTransition] = useTransition();

  function mover(tarjeta: TarjetaTablero, destino: EstadoOrden) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("estado", destino);
      let resultado: EstadoFormState;
      try {
        resultado = await updateEstadoOrdenAction(tarjeta.id, initialState, formData);
      } catch {
        toast.error("No se pudo mover la orden. Intenta de nuevo.");
        return;
      }
      if (resultado.error) {
        toast.error(resultado.error);
        return;
      }
      toast.success(`${tarjeta.placa}: ${ESTADO_LABELS[destino]}`);
    });
  }

  function pedirMovimiento(tarjeta: TarjetaTablero, destino: EstadoOrden) {
    if (requiereConfirmacion(destino)) {
      setConfirmando({ tarjeta, destino });
      return;
    }
    mover(tarjeta, destino);
  }

  return (
    <>
      {confirmando ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-2">
          <ConfirmacionEnLinea
            pregunta={`¿Anular la orden ${confirmando.tarjeta.placa}? No se podrá editar después.`}
            etiquetaConfirmar="Sí, anular"
            pendiente={pendiente}
            onConfirmar={() => {
              mover(confirmando.tarjeta, confirmando.destino);
              setConfirmando(null);
            }}
            onCancelar={() => setConfirmando(null)}
          />
        </div>
      ) : null}

      <div className="flex items-start gap-3 overflow-x-auto pb-1">
        {columnas.map((columna) => {
          const admiteSoltar = arrastrando
            ? ESTADO_ORDEN_TRANSITIONS[arrastrando.estado].includes(columna.estado) && columna.estado !== "ENTREGADA"
            : false;

          return (
            <div
              key={columna.estado}
              data-columna={columna.estado}
              onDragOver={(evento) => {
                if (!admiteSoltar) return;
                evento.preventDefault();
                setSobreColumna(columna.estado);
              }}
              onDragLeave={() => setSobreColumna((actual) => (actual === columna.estado ? null : actual))}
              onDrop={(evento) => {
                if (!arrastrando || !admiteSoltar) return;
                evento.preventDefault();
                const tarjeta = arrastrando;
                setArrastrando(null);
                setSobreColumna(null);
                mover(tarjeta, columna.estado);
              }}
              className={cn(
                "flex w-64 shrink-0 flex-col gap-2 rounded-xl border border-border bg-muted/30 p-2 transition-colors",
                sobreColumna === columna.estado && "border-primary bg-primary/5",
              )}
            >
              <div className="flex items-center gap-1.5 px-1.5 py-1">
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ background: ESTADO_DOT_COLOR[columna.estado] }}
                />
                <span className="flex-1 text-xs font-semibold">{ESTADO_LABELS[columna.estado]}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{columna.ordenes.length}</span>
              </div>

              <div className="flex flex-col gap-2">
                {columna.ordenes.length === 0 ? (
                  <p className="px-1.5 text-xs text-muted-foreground">Sin órdenes</p>
                ) : (
                  columna.ordenes.map((tarjeta) => (
                    <Tarjeta
                      key={tarjeta.id}
                      tarjeta={tarjeta}
                      pendiente={pendiente}
                      puedeAnularOrdenes={puedeAnularOrdenes}
                      onArrastrar={() => setArrastrando(tarjeta)}
                      onSoltarArrastre={() => {
                        setArrastrando(null);
                        setSobreColumna(null);
                      }}
                      onMover={(destino) => pedirMovimiento(tarjeta, destino)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Tarjeta({
  tarjeta,
  pendiente,
  puedeAnularOrdenes,
  onArrastrar,
  onSoltarArrastre,
  onMover,
}: {
  tarjeta: TarjetaTablero;
  pendiente: boolean;
  puedeAnularOrdenes: boolean;
  onArrastrar: () => void;
  onSoltarArrastre: () => void;
  onMover: (destino: EstadoOrden) => void;
}) {
  const destinos = destinosArrastrables(tarjeta.estado);
  // El menú también sale cuando no hay nada que arrastrar pero sí algo que
  // ofrecer: una orden TERMINADA se entrega desde el acta de su ficha.
  const muestraMenu = ofreceMenu(tarjeta.estado, tarjeta.movible);
  const anulable = puedeAnularOrdenes && puedeAnular(tarjeta.estado, tarjeta.movible);
  const entregable = puedeEntregar(tarjeta.estado);
  const movible = tarjeta.movible && destinos.length > 0;
  const router = useRouter();

  // Un clic en la tarjeta abre la orden, como en cualquier tablero (arrastrar no
  // dispara click). Se ignoran la placa (ya es un enlace), el botón del menú y
  // lo que pase dentro del menú: vive en un portal fuera de la tarjeta, pero
  // React igual le hace llegar sus clics.
  function abrir(evento: MouseEvent<HTMLDivElement>) {
    const objetivo = evento.target as HTMLElement;
    if (!evento.currentTarget.contains(objetivo) || objetivo.closest("a, button")) return;
    router.push(`/ordenes/${tarjeta.id}`);
  }

  return (
    <div
      onClick={abrir}
      draggable={movible && !pendiente}
      onDragStart={() => onArrastrar()}
      onDragEnd={onSoltarArrastre}
      style={{ borderLeftColor: ESTADO_DOT_COLOR[tarjeta.estado] }}
      className={cn(
        "flex cursor-pointer flex-col gap-1.5 rounded-lg border border-l-2 border-border bg-card p-2.5 text-xs transition-shadow hover:shadow-md",
        movible && "active:cursor-grabbing",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Link href={`/ordenes/${tarjeta.id}`} className="font-mono text-[13px] font-semibold hover:underline">
          {tarjeta.placa}
        </Link>
        <span className="flex items-center gap-1">
          <PrioridadBadge prioridad={tarjeta.prioridad} className="text-[10px]" />
          {muestraMenu ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    aria-label={`Mover la orden ${tarjeta.placa}`}
                    disabled={pendiente}
                  />
                }
              >
                <MoreHorizontal className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {/* Base UI: el título va dentro de un grupo (suelto, abrir el menú rompía la
                    página) y los ítems reaccionan a onClick, no a onSelect (eso era de Radix:
                    con onSelect, elegir un destino no hacía nada). */}
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Mover a…</DropdownMenuLabel>
                  {destinos.map((destino) => (
                    <DropdownMenuItem key={destino} onClick={() => onMover(destino)}>
                      {ESTADO_LABELS[destino]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                {entregable ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem render={<Link href={`/ordenes/${tarjeta.id}?tab=entrega`} />}>
                      <Truck className="size-3.5" />
                      Entregar (ir al acta)
                    </DropdownMenuItem>
                  </>
                ) : null}
                {anulable ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => onMover("ANULADA")}>
                      Anular
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </span>
      </div>

      {tarjeta.alertaDias !== null ? (
        <Badge
          variant="outline"
          className="w-fit gap-1 border-transparent bg-destructive/10 text-[10px] text-destructive"
          title={tarjeta.alertaMotivo === "TERMINADA_SIN_ENTREGAR" ? "Lista sin entregar" : "Estancada"}
        >
          <Clock className="size-3 shrink-0" />
          {tarjeta.alertaDias} días sin actividad
        </Badge>
      ) : null}

      <p className="line-clamp-2 text-muted-foreground">{tarjeta.sintomas ?? "Sin síntomas registrados"}</p>
      <p className="text-[10.5px] text-muted-foreground">{tarjeta.cliente}</p>
      <div className="flex items-center justify-between gap-2 border-t border-border pt-1.5">
        <span className="truncate text-[10.5px] text-muted-foreground">
          {tarjeta.mecanico ?? "Sin asignar"}
        </span>
        <span className="shrink-0 font-mono text-[11px] font-medium">{formatoMoneda.format(tarjeta.total)}</span>
      </div>
    </div>
  );
}
