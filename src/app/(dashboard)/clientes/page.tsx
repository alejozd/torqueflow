import Link from "next/link";
import { listClientes } from "@/app/actions/cliente-actions";
import { NuevoClienteForm } from "./nuevo-cliente-form";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Cliente } from "@/generated/prisma-tenant";

const COLUMNS: DataTableColumn<Cliente>[] = [
  {
    header: "Nombre",
    cell: (cliente) => <Link href={`/clientes/${cliente.id}`}>{cliente.nombre}</Link>,
  },
];

export default async function ClientesPage() {
  const clientes = await listClientes();

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Clientes</h1>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <NuevoClienteForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={COLUMNS}
            rows={clientes}
            getRowKey={(cliente) => cliente.id}
            emptyMessage="No hay clientes registrados."
          />
        </CardContent>
      </Card>
    </main>
  );
}
