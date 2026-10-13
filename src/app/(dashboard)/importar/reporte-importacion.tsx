"use client";

import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { EstadoHoja, FilaReporte, ResumenHoja, ResultadoImportacion } from "@/lib/importacion/resultado";

const COLUMNAS: DataTableColumn<FilaReporte>[] = [
  { header: "Hoja", cell: (fila) => fila.hoja },
  { header: "Fila", className: "text-right font-mono text-xs", cell: (fila) => fila.fila },
  { header: "Columna", cell: (fila) => fila.columna ?? "—" },
  { header: "Valor", className: "max-w-48 truncate", cell: (fila) => fila.valor ?? "—" },
  {
    header: "Resultado",
    cell: (fila) =>
      fila.tipo === "ya_existia" ? (
        <Badge variant="secondary">Ya existía</Badge>
      ) : (
        <Badge variant="destructive">Rechazada</Badge>
      ),
  },
  { header: "Motivo", cell: (fila) => fila.motivo },
];

const ETIQUETA_ESTADO: Record<EstadoHoja, string> = {
  ok: "Listo",
  omitida: "Omitida",
  error: "Error",
};

function ResumenDeHoja({ resumen }: { resumen: ResumenHoja }) {
  return (
    <>
      <TableRow>
        <TableCell className="font-medium">{resumen.hoja}</TableCell>
        <TableCell className="text-right font-mono text-xs">{resumen.leidas}</TableCell>
        <TableCell className="text-right font-mono text-xs">{resumen.creadas}</TableCell>
        <TableCell className="text-right font-mono text-xs">{resumen.existentes}</TableCell>
        <TableCell className="text-right font-mono text-xs">{resumen.rechazadas}</TableCell>
        <TableCell>
          <Badge variant={resumen.estado === "error" ? "destructive" : resumen.estado === "omitida" ? "secondary" : "default"}>
            {ETIQUETA_ESTADO[resumen.estado]}
          </Badge>
        </TableCell>
      </TableRow>
      {resumen.motivo ? (
        <TableRow>
          <TableCell colSpan={6} className="pt-0 text-xs text-muted-foreground">
            {resumen.hoja}: {resumen.motivo}
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

/**
 * Resultado de una importación: primero el resumen por hoja (qué entró, qué ya
 * existía y qué se rechazó) y después el detalle fila por fila de lo que quedó
 * por fuera, para que el taller corrija y vuelva a subir solo eso.
 */
export function ReporteImportacion({ resultado }: { resultado: ResultadoImportacion }) {
  const creadas = resultado.resumen.reduce((suma, hoja) => suma + hoja.creadas, 0);
  const existentes = resultado.resumen.reduce((suma, hoja) => suma + hoja.existentes, 0);
  const rechazadas = resultado.resumen.reduce((suma, hoja) => suma + hoja.rechazadas, 0);

  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="text-sm font-medium">
        {creadas === 0
          ? "No se creó nada nuevo."
          : creadas === 1
            ? "Se creó 1 registro."
            : `Se crearon ${creadas} registros.`}
        {existentes > 0 ? ` ${existentes} ${existentes === 1 ? "fila ya existía" : "filas ya existían"}.` : ""}
        {rechazadas > 0 ? ` ${rechazadas} ${rechazadas === 1 ? "fila quedó" : "filas quedaron"} por fuera.` : ""}
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Hoja</TableHead>
            <TableHead className="text-right">Leídas</TableHead>
            <TableHead className="text-right">Creadas</TableHead>
            <TableHead className="text-right">Ya existían</TableHead>
            <TableHead className="text-right">Rechazadas</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {resultado.resumen.map((resumen) => (
            <ResumenDeHoja key={resumen.hoja} resumen={resumen} />
          ))}
        </TableBody>
      </Table>

      {resultado.filas.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Filas para revisar</h3>
          <DataTable
            columns={COLUMNAS}
            rows={resultado.filas}
            getRowKey={(fila) => `${fila.hoja}-${fila.fila}-${fila.motivo}`}
            emptyMessage="No hay filas por revisar."
            headerClassName="bg-muted"
          />
          {resultado.filasOcultas > 0 ? (
            <p className="text-xs text-muted-foreground">
              Y {resultado.filasOcultas} {resultado.filasOcultas === 1 ? "fila más" : "filas más"} con novedades que no
              caben en esta lista: corrige estas y vuelve a subir el archivo.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
