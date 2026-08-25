import Link from "next/link";
import { listClientes } from "@/app/actions/cliente-actions";
import { NuevoClienteForm } from "./nuevo-cliente-form";
import { DataTable, type DataTableColumn } from "@/components/data-table";
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
    <main>
      <h1>Clientes</h1>
      <NuevoClienteForm />
      <DataTable
        columns={COLUMNS}
        rows={clientes}
        getRowKey={(cliente) => cliente.id}
        emptyMessage="No hay clientes registrados."
      />
    </main>
  );
}
