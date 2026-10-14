import type { LiquidacionFila as FilaDatos } from "@/app/actions/liquidacion-actions";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LiquidacionFila } from "./liquidacion-fila";

/**
 * Tabla del periodo, en vivo (D10): cada técnico se paga desde su fila y el pago
 * congela el cálculo de ese momento. Las pagadas no cambian aunque cambie el
 * esquema; anular una deja el periodo otra vez por pagar.
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
  if (filas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Esta sede no tiene técnicos. Los usuarios con rol Técnico aparecen aquí para liquidarles su trabajo.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Técnico</TableHead>
          <TableHead className="text-right">Órdenes</TableHead>
          <TableHead className="text-right">Trabajos</TableHead>
          <TableHead className="text-right">Mano de obra</TableHead>
          <TableHead className="text-right">$ / trabajo</TableHead>
          <TableHead>Esquema</TableHead>
          <TableHead className="text-right">A pagar</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {filas.map((fila) => (
          <LiquidacionFila key={fila.usuarioId} fila={fila} periodo={periodo} etiquetaPeriodo={etiquetaPeriodo} />
        ))}
      </TableBody>
    </Table>
  );
}
