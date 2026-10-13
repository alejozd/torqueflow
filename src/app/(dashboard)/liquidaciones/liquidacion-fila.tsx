"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  actualizarAjusteLiquidacionAction,
  anularLiquidacionAction,
  reactivarLiquidacionAction,
  type AjusteLiquidacionFormState,
  type LiquidacionFila as FilaDatos,
} from "@/app/actions/liquidacion-actions";
import { ConfirmacionEnLinea } from "@/components/confirmacion-en-linea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableCell, TableRow } from "@/components/ui/table";
import { PagarLiquidacionDialog } from "./pagar-liquidacion-dialog";

const initialState: AjusteLiquidacionFormState = { error: null, success: false };
const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" });
const formatoPorcentaje = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

export const ESTADO_LABELS = { PENDIENTE: "Pendiente", PAGADA: "Pagada", ANULADA: "Anulada" } as const;

/** La forma de pago vigente, en una línea (misma idea que la sección de esquemas). */
export function esquemaEnUnaLinea(fila: FilaDatos): string {
  if (!fila.tipo) return "Sin esquema";
  const porcentaje = `${formatoPorcentaje.format(fila.porcentaje ?? 0)} %`;
  const base = formatoMoneda.format(fila.montoFijo ?? 0);
  if (fila.tipo === "PORCENTAJE") return `${porcentaje} de la mano de obra`;
  if (fila.tipo === "FIJO") return `Base fija de ${base}`;
  return `Base de ${base} + ${porcentaje}`;
}

export function LiquidacionFila({ fila, etiquetaPeriodo }: { fila: FilaDatos; etiquetaPeriodo: string }) {
  const [ajustando, setAjustando] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [ajuste, setAjuste] = useState(fila.documento ? String(fila.documento.ajuste) : "0");
  const [motivo, setMotivo] = useState(fila.documento?.motivoAjuste ?? "");
  const [motivoAnulacion, setMotivoAnulacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const documento = fila.documento;
  const calculado = documento ? documento.montoCalculado : fila.montoSugerido;

  function guardarAjuste() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("ajuste", ajuste);
      formData.set("motivo", motivo);
      const result = await actualizarAjusteLiquidacionAction(documento!.id, initialState, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setAjustando(false);
      toast.success("Ajuste guardado");
    });
  }

  function anular() {
    startTransition(async () => {
      const result = await anularLiquidacionAction(documento!.id, motivoAnulacion);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setAnulando(false);
      toast.success("Liquidación anulada");
    });
  }

  function reactivar() {
    startTransition(async () => {
      const result = await reactivarLiquidacionAction(documento!.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      toast.success("Liquidación reactivada");
    });
  }

  return (
    <>
      <TableRow>
        <TableCell>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium">{fila.nombre}</span>
            {!fila.tipo ? <Badge variant="destructive">Sin esquema de pago</Badge> : null}
            {documento?.hayCambios ? <Badge variant="secondary">Cambios sin reflejar</Badge> : null}
            {fila.solapada ? <Badge variant="destructive">Ya liquidado en otro periodo</Badge> : null}
          </div>
        </TableCell>
        <TableCell className="text-right font-mono text-sm">{fila.ordenes}</TableCell>
        <TableCell className="text-right font-mono text-sm">{fila.trabajos}</TableCell>
        <TableCell className="text-right font-mono text-sm">{formatoMoneda.format(fila.montoManoObra)}</TableCell>
        <TableCell className="text-right font-mono text-sm text-muted-foreground">
          {fila.montoPorTrabajo === null ? "—" : formatoMoneda.format(fila.montoPorTrabajo)}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">{esquemaEnUnaLinea(fila)}</TableCell>
        <TableCell className="text-right font-mono text-sm">
          {calculado === null ? "—" : formatoMoneda.format(calculado)}
          <span className="ml-1 text-[10px] text-muted-foreground">{documento ? "congelado" : "estimado"}</span>
        </TableCell>
        <TableCell>
          {documento ? (
            <div className="flex flex-col items-start gap-0.5">
              <Badge variant={documento.estado === "PAGADA" ? "default" : "secondary"}>
                {ESTADO_LABELS[documento.estado]}
              </Badge>
              <span className="font-mono text-xs">{formatoMoneda.format(documento.total)}</span>
              {documento.ajuste !== 0 ? (
                <span className="text-[10px] text-muted-foreground">
                  ajuste {formatoMoneda.format(documento.ajuste)}
                  {documento.motivoAjuste ? ` · ${documento.motivoAjuste}` : ""}
                </span>
              ) : null}
              {documento.motivoAnulacion ? (
                <span className="text-[10px] text-muted-foreground">anulada: {documento.motivoAnulacion}</span>
              ) : null}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Sin generar</span>
          )}
        </TableCell>
        <TableCell>
          <div className="flex flex-wrap justify-end gap-1">
            {documento?.estado === "PENDIENTE" ? (
              <>
                <Button type="button" size="sm" variant="outline" onClick={() => setAjustando(!ajustando)}>
                  Ajuste
                </Button>
                <PagarLiquidacionDialog
                  liquidacionId={documento.id}
                  nombre={fila.nombre}
                  periodo={etiquetaPeriodo}
                  total={documento.total}
                />
              </>
            ) : null}
            {documento && documento.estado !== "ANULADA" && !anulando ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setAnulando(true)}>
                Anular
              </Button>
            ) : null}
            {documento?.estado === "ANULADA" ? (
              <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={reactivar}>
                Reactivar
              </Button>
            ) : null}
          </div>
        </TableCell>
      </TableRow>

      {ajustando && documento ? (
        <TableRow>
          <TableCell colSpan={9} className="bg-muted/40">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`ajuste-${documento.id}`}>Ajuste (puede ser negativo)</Label>
                <Input
                  id={`ajuste-${documento.id}`}
                  type="number"
                  step="0.01"
                  className="w-40 font-mono"
                  value={ajuste}
                  onChange={(evento) => setAjuste(evento.target.value)}
                />
              </div>
              <div className="flex min-w-64 flex-1 flex-col gap-1.5">
                <Label htmlFor={`motivo-${documento.id}`}>Motivo</Label>
                <Input
                  id={`motivo-${documento.id}`}
                  value={motivo}
                  onChange={(evento) => setMotivo(evento.target.value)}
                />
              </div>
              <Button type="button" size="sm" disabled={isPending} onClick={guardarAjuste}>
                Guardar ajuste
              </Button>
            </div>
          </TableCell>
        </TableRow>
      ) : null}

      {anulando && documento ? (
        <TableRow>
          <TableCell colSpan={9} className="bg-muted/40">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex min-w-64 flex-1 flex-col gap-1.5">
                <Label htmlFor={`motivo-anulacion-${documento.id}`}>Motivo de la anulación</Label>
                <Input
                  id={`motivo-anulacion-${documento.id}`}
                  value={motivoAnulacion}
                  onChange={(evento) => setMotivoAnulacion(evento.target.value)}
                />
              </div>
              <ConfirmacionEnLinea
                pregunta={
                  documento.estado === "PAGADA"
                    ? "¿Anular y borrar el gasto del pago?"
                    : "¿Anular la liquidación?"
                }
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
