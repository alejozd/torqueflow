"use client";

import type { MovimientoCajaFila } from "@/app/actions/caja-actions";
import type { CajaCerradaFila } from "@/lib/caja/resumen";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const formatoHora = new Intl.DateTimeFormat("es-CO", { timeStyle: "short", timeZone: "America/Bogota" });
const formatoFechaHora = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

const ETIQUETA_TIPO = {
  PAGO: "Pago",
  VENTA: "Venta de mostrador",
  ANTICIPO: "Anticipo",
  DEVOLUCION: "Devolución",
  GASTO: "Gasto",
  PAGO_PROVEEDOR: "Pago a proveedor",
} as const;

const ETIQUETA_METODO = {
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta",
  TRANSFERENCIA: "Transferencia",
  OTRO: "Otro",
} as const;

export function MovimientosTable({ filas }: { filas: MovimientoCajaFila[] }) {
  const columns: DataTableColumn<MovimientoCajaFila>[] = [
    { header: "Hora", cell: (m) => formatoHora.format(m.fecha) },
    { header: "Tipo", cell: (m) => <Badge variant="outline">{ETIQUETA_TIPO[m.tipo]}</Badge> },
    { header: "Descripción", cell: (m) => m.descripcion },
    { header: "Método", cell: (m) => ETIQUETA_METODO[m.metodo] },
    {
      header: "Monto",
      className: "text-right",
      cell: (m) => (
        <span className={m.monto < 0 ? "font-mono font-medium text-red-600 dark:text-red-400" : "font-mono font-medium"}>
          {formatoMoneda.format(m.monto)}
        </span>
      ),
    },
  ];
  return (
    <DataTable
      columns={columns}
      rows={filas}
      getRowKey={(m) => m.id}
      emptyMessage="Aún no hay movimientos desde la apertura."
    />
  );
}

export function HistorialCajasTable({ filas }: { filas: CajaCerradaFila[] }) {
  const columns: DataTableColumn<CajaCerradaFila>[] = [
    { header: "Apertura", cell: (c) => formatoFechaHora.format(c.abiertaAt) },
    { header: "Cierre", cell: (c) => formatoFechaHora.format(c.cerradaAt) },
    { header: "Abrió", cell: (c) => c.abrioPorNombre },
    { header: "Cerró", cell: (c) => c.cerroPorNombre },
    { header: "Base", className: "text-right", cell: (c) => <span className="font-mono">{formatoMoneda.format(c.baseInicial)}</span> },
    { header: "Esperado", className: "text-right", cell: (c) => <span className="font-mono">{formatoMoneda.format(c.esperado)}</span> },
    { header: "Contado", className: "text-right", cell: (c) => <span className="font-mono">{formatoMoneda.format(c.contado)}</span> },
    {
      header: "Diferencia",
      className: "text-right",
      cell: (c) =>
        c.tipo === "CUADRA" ? (
          <Badge variant="outline">Cuadra</Badge>
        ) : (
          <span className="font-mono">
            {c.tipo === "SOBRANTE" ? "Sobrante " : "Faltante "}
            {formatoMoneda.format(Math.abs(c.diferencia))}
          </span>
        ),
    },
    { header: "Notas", cell: (c) => c.notas ?? "—" },
  ];
  return (
    <DataTable
      columns={columns}
      rows={filas}
      getRowKey={(c) => c.id}
      emptyMessage="No hay cierres de caja en este mes."
    />
  );
}
