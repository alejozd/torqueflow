import { notFound } from "next/navigation";
import Link from "next/link";
import { getVehiculo } from "@/app/actions/vehiculo-actions";
import { listHistorial, type HistorialEntryWithAutor } from "@/app/actions/historial-actions";
import { listOrdenesByVehiculo, listTecnicos } from "@/app/actions/orden-actions";
import { NuevaEntradaForm } from "./nueva-entrada-form";
import { NuevaOrdenForm } from "./nueva-orden-form";
import { DataTable, type DataTableColumn } from "@/components/data-table";

type OrdenRow = Awaited<ReturnType<typeof listOrdenesByVehiculo>>[number];

const ORDENES_COLUMNS: DataTableColumn<OrdenRow>[] = [
  {
    header: "Orden",
    cell: (orden) => (
      <Link href={`/ordenes/${orden.id}`}>
        {new Date(orden.createdAt).toLocaleDateString()} — {orden.estado}
      </Link>
    ),
  },
];

const HISTORIAL_COLUMNS: DataTableColumn<HistorialEntryWithAutor>[] = [
  {
    header: "Historial",
    cell: (entrada) => (
      <>
        {new Date(entrada.fecha).toLocaleDateString()} — {entrada.descripcion} —{" "}
        {entrada.autor?.nombre ?? "Desconocido"}
      </>
    ),
  },
];

export default async function VehiculoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vehiculo = await getVehiculo(id);

  if (!vehiculo) {
    notFound();
  }

  const [historial, ordenes, tecnicos] = await Promise.all([
    listHistorial(id),
    listOrdenesByVehiculo(id),
    listTecnicos(),
  ]);

  return (
    <main>
      <h1>
        {vehiculo.placa} — {vehiculo.marca} {vehiculo.modelo}
      </h1>
      <p>Año: {vehiculo.anio ?? "—"}</p>

      <h2>Órdenes de trabajo</h2>
      <NuevaOrdenForm clienteId={vehiculo.clienteId} vehiculoId={vehiculo.id} tecnicos={tecnicos} />
      <DataTable
        columns={ORDENES_COLUMNS}
        rows={ordenes}
        getRowKey={(orden) => orden.id}
        emptyMessage="Este vehículo no tiene órdenes de trabajo."
      />

      <h2>Historial</h2>
      <NuevaEntradaForm vehiculoId={vehiculo.id} />
      <DataTable
        columns={HISTORIAL_COLUMNS}
        rows={historial}
        getRowKey={(entrada) => entrada.id}
        emptyMessage="Este vehículo no tiene historial registrado."
      />
    </main>
  );
}
