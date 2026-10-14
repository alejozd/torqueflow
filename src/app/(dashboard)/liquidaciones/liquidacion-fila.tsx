"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { anularLiquidacionAction, type LiquidacionFila as FilaDatos } from "@/app/actions/liquidacion-actions";
import { ConfirmacionEnLinea } from "@/components/confirmacion-en-linea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableCell, TableRow } from "@/components/ui/table";
import { PagarLiquidacionDialog } from "./pagar-liquidacion-dialog";

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" });
const formatoPorcentaje = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" });

/** La forma de pago vigente, en una línea (misma idea que la sección de esquemas). */
export function esquemaEnUnaLinea(fila: FilaDatos): string {
  if (!fila.tipo) return "Sin esquema";
  const porcentaje = `${formatoPorcentaje.format(fila.porcentaje ?? 0)} %`;
  const base = formatoMoneda.format(fila.montoFijo ?? 0);
  if (fila.tipo === "PORCENTAJE") return `${porcentaje} de la mano de obra`;
  if (fila.tipo === "FIJO") return `Base fija de ${base}`;
  return `Base de ${base} + ${porcentaje}`;
}

/**
 * Un técnico en el periodo (D10): por pagar (con el botón de pagar), pagado (con
 * lo congelado del pago y la opción de anularlo) o bloqueado (sin esquema, o con
 * el trabajo ya pagado en otro periodo).
 */
export function LiquidacionFila({
  fila,
  periodo,
  etiquetaPeriodo,
}: {
  fila: FilaDatos;
  periodo: string;
  etiquetaPeriodo: string;
}) {
  const [anulando, setAnulando] = useState(false);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const { pago } = fila;
  const sePuedePagar = !pago && fila.tipo !== null && !fila.solapada;

  function anular() {
    startTransition(async () => {
      const result = await anularLiquidacionAction(pago!.id, motivoAnulacion);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setAnulando(false);
      toast.success("Pago anulado: el periodo vuelve a estar por pagar");
    });
  }

  return (
    <>
      <TableRow>
        <TableCell className="text-sm font-medium">{fila.nombre}</TableCell>
        <TableCell className="text-right font-mono text-sm">{fila.ordenes}</TableCell>
        <TableCell className="text-right font-mono text-sm">{fila.trabajos}</TableCell>
        <TableCell className="text-right font-mono text-sm">{formatoMoneda.format(fila.montoManoObra)}</TableCell>
        <TableCell className="text-right font-mono text-sm text-muted-foreground">
          {fila.montoPorTrabajo === null ? "—" : formatoMoneda.format(fila.montoPorTrabajo)}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">{esquemaEnUnaLinea(fila)}</TableCell>
        <TableCell className="text-right">
          {pago ? (
            <div className="flex flex-col items-end gap-0.5">
              <span className="font-mono text-sm">{formatoMoneda.format(pago.total)}</span>
              {pago.ajuste !== 0 ? (
                <span className="text-[11px] text-muted-foreground">
                  ajuste {formatoMoneda.format(pago.ajuste)}
                  {pago.motivoAjuste ? ` · ${pago.motivoAjuste}` : ""}
                </span>
              ) : null}
            </div>
          ) : (
            <span className="font-mono text-sm">
              {fila.montoSugerido === null ? "—" : formatoMoneda.format(fila.montoSugerido)}
            </span>
          )}
        </TableCell>
        <TableCell>
          {pago ? (
            <div className="flex flex-col items-start gap-0.5">
              <Badge>Pagada</Badge>
              {pago.pagadaAt ? (
                <span className="text-[11px] text-muted-foreground">{formatoFecha.format(pago.pagadaAt)}</span>
              ) : null}
            </div>
          ) : !fila.tipo ? (
            <Badge variant="destructive">Sin esquema de pago</Badge>
          ) : fila.solapada ? (
            <Badge variant="destructive">Ya pagado en otro periodo</Badge>
          ) : (
            <Badge variant="secondary">Por pagar</Badge>
          )}
        </TableCell>
        <TableCell>
          <div className="flex justify-end">
            {sePuedePagar ? (
              <PagarLiquidacionDialog
                usuarioId={fila.usuarioId}
                nombre={fila.nombre}
                periodo={periodo}
                etiquetaPeriodo={etiquetaPeriodo}
                calculado={fila.montoSugerido ?? 0}
              />
            ) : null}
            {pago && !anulando ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setAnulando(true)}>
                Anular
              </Button>
            ) : null}
          </div>
        </TableCell>
      </TableRow>

      {anulando && pago ? (
        <TableRow>
          <TableCell colSpan={9} className="bg-muted/40">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex min-w-64 flex-1 flex-col gap-1.5">
                <Label htmlFor={`motivo-anulacion-${pago.id}`}>Motivo de la anulación</Label>
                <Input
                  id={`motivo-anulacion-${pago.id}`}
                  value={motivoAnulacion}
                  onChange={(evento) => setMotivoAnulacion(evento.target.value)}
                />
              </div>
              <ConfirmacionEnLinea
                pregunta="¿Anular el pago y borrar su gasto?"
                etiquetaConfirmar="Anular"
                pendiente={isPending}
                onCancelar={() => setAnulando(false)}
                onConfirmar={anular}
              />
            </div>
          </TableCell>
        </TableRow>
      ) : null}

      {error ? (
        <TableRow>
          <TableCell colSpan={9}>
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
