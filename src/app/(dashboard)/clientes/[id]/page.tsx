import Link from "next/link";
import { notFound } from "next/navigation";
import { getCliente } from "@/app/actions/cliente-actions";
import { NuevoVehiculoForm } from "./nuevo-vehiculo-form";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import type { Vehiculo } from "@/generated/prisma-tenant";

const VEHICULOS_COLUMNS: DataTableColumn<Vehiculo>[] = [
  {
    header: "Vehículo",
    cell: (vehiculo) => (
      <Link href={`/vehiculos/${vehiculo.id}`}>
        {vehiculo.placa} — {vehiculo.marca} {vehiculo.modelo}
      </Link>
    ),
  },
];

export default async function ClienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cliente = await getCliente(id);

  if (!cliente) {
    notFound();
  }

  return (
    <main>
      <h1>{cliente.nombre}</h1>
      <p>Teléfono: {cliente.telefono ?? "—"}</p>
      <p>Correo: {cliente.email ?? "—"}</p>
      <p>Documento: {cliente.documento ?? "—"}</p>

      <h2>Vehículos</h2>
      <NuevoVehiculoForm clienteId={cliente.id} />
      <DataTable
        columns={VEHICULOS_COLUMNS}
        rows={cliente.vehiculos}
        getRowKey={(vehiculo) => vehiculo.id}
        emptyMessage="Este cliente no tiene vehículos registrados."
      />
    </main>
  );
}
