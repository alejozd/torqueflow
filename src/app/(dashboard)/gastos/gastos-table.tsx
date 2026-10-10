"use client";

import { useRouter } from "next/navigation";
import { eliminarGastoAction, type GastoFila } from "@/app/actions/gasto-actions";
import type { CategoriaGastoVista } from "@/app/actions/categoria-gasto-actions";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { EliminarConConfirmacion } from "@/components/eliminar-con-confirmacion";
import { Badge } from "@/components/ui/badge";
import { GastoDialog } from "./gasto-dialog";

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
// @db.Date llega como medianoche UTC: se formatea en UTC para no correr el día.
const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "UTC" });

export function GastosTable({
  filas,
  esAdmin,
  categorias,
  sedeId,
  sedes,
}: {
  filas: GastoFila[];
  esAdmin: boolean;
  categorias: CategoriaGastoVista[];
  sedeId: string;
  sedes?: { id: string; nombre: string }[];
}) {
  const router = useRouter();

  const columns: DataTableColumn<GastoFila>[] = [
    { header: "Fecha", cell: (g) => formatoFecha.format(g.fecha) },
    {
      header: "Descripción",
      cell: (g) => (
        <span className="flex flex-wrap items-center gap-2">
          {g.descripcion}
          {g.esRecurrente ? (
            <Badge variant="outline" className="font-normal">
              Recurrente
            </Badge>
          ) : null}
        </span>
      ),
    },
    { header: "Categoría", cell: (g) => g.categoriaNombre },
    { header: "Referencia", cell: (g) => g.referencia ?? "—" },
    {
      header: "Monto",
      className: "text-right",
      cell: (g) => <span className="font-mono font-medium">{formatoMoneda.format(g.monto)}</span>,
    },
    { header: "Registrado por", cell: (g) => g.registradoPorNombre },
  ];

  if (esAdmin) {
    columns.push({
      header: "Acciones",
      cell: (g) => (
        <div className="flex flex-wrap items-center gap-1">
          <GastoDialog modo="editar" gasto={g} categorias={categorias} sedeIdPorDefecto={sedeId} sedes={sedes} />
          <EliminarConConfirmacion
            etiqueta="Eliminar"
            confirmacion={`¿Eliminar el gasto "${g.descripcion}"?`}
            accion={async () => {
              const { error } = await eliminarGastoAction(g.id);
              return { error, success: error === null };
            }}
            onEliminado={() => router.refresh()}
          />
        </div>
      ),
    });
  }

  return (
    <DataTable
      columns={columns}
      rows={filas}
      getRowKey={(g) => g.id}
      emptyMessage="No hay gastos registrados en este mes."
      headerClassName="bg-muted"
    />
  );
}
