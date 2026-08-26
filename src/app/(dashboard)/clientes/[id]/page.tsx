import Link from "next/link";
import { notFound } from "next/navigation";
import { getCliente } from "@/app/actions/cliente-actions";
import { NuevoVehiculoForm } from "./nuevo-vehiculo-form";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{cliente.nombre}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Información del cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Teléfono</p>
              <p>{cliente.telefono ?? "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Correo</p>
              <p>{cliente.email ?? "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Documento</p>
              <p>{cliente.documento ?? "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vehículos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <NuevoVehiculoForm clienteId={cliente.id} />
          <DataTable
            columns={VEHICULOS_COLUMNS}
            rows={cliente.vehiculos}
            getRowKey={(vehiculo) => vehiculo.id}
            emptyMessage="Este cliente no tiene vehículos registrados."
          />
        </CardContent>
      </Card>
    </main>
  );
}
