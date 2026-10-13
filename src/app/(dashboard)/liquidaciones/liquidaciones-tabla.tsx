"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { generarLiquidacionesAction, type LiquidacionFila as FilaDatos } from "@/app/actions/liquidacion-actions";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LiquidacionFila } from "./liquidacion-fila";

/**
 * Tabla del periodo. "Generar" crea las que faltan y recalcula las pendientes
 * cuyos números cambiaron; nunca toca una pagada (D9/D10).
 */
export function LiquidacionesTabla({
  filas,
  periodo,
  etiquetaPeriodo,
}: {
  filas: FilaDatos[];
  periodo: string;
  etiquetaPeriodo: string;
}) {
  const [isPending, startTransition] = useTransition();
  const hayDocumentos = filas.some((fila) => fila.documento !== null);
  const hayCambios = filas.some((fila) => fila.documento?.hayCambios);

  function generar() {
    startTransition(async () => {
      const result = await generarLiquidacionesAction(periodo);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const partes = [
        result.generadas > 0 ? `${result.generadas} ${result.generadas === 1 ? "generada" : "generadas"}` : null,
        result.actualizadas > 0 ? `${result.actualizadas} ${result.actualizadas === 1 ? "actualizada" : "actualizadas"}` : null,
        result.omitidas > 0 ? `${result.omitidas} sin cambios` : null,
      ].filter((parte): parte is string => parte !== null);
      const avisos = [
        result.sinEsquema > 0 ? `${result.sinEsquema} sin esquema` : null,
        result.solapadas > 0 ? `${result.solapadas} ya liquidadas en otro periodo` : null,
      ].filter((aviso): aviso is string => aviso !== null);

      toast.success(
        partes.length > 0
          ? `Liquidaciones: ${partes.join(", ")}${avisos.length > 0 ? ` (${avisos.join(", ")})` : ""}`
          : "No había nada que liquidar en este periodo",
      );
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {hayCambios
            ? "Hay liquidaciones pendientes cuyos números cambiaron: vuelve a generar el periodo para actualizarlas."
            : "Generar crea las que faltan y recalcula las pendientes; las pagadas no se tocan."}
        </p>
        <Button type="button" disabled={isPending} onClick={generar}>
          {isPending ? "Generando..." : hayDocumentos ? "Regenerar liquidaciones del periodo" : "Generar liquidaciones del periodo"}
        </Button>
      </div>

      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Esta sede no tiene técnicos. Los usuarios con rol Técnico aparecen aquí para liquidarles su trabajo.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Técnico</TableHead>
              <TableHead className="text-right">Órdenes</TableHead>
              <TableHead className="text-right">Trabajos</TableHead>
              <TableHead className="text-right">Mano de obra</TableHead>
              <TableHead className="text-right">$ / trabajo</TableHead>
              <TableHead>Esquema</TableHead>
              <TableHead className="text-right">Calculado</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((fila) => (
              <LiquidacionFila key={fila.usuarioId} fila={fila} etiquetaPeriodo={etiquetaPeriodo} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
