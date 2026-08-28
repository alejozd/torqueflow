import Link from "next/link";
import { listProveedoresConInventario, type ProveedorConInventario } from "@/app/actions/proveedor-actions";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { EditarProveedorDialog } from "./editar-proveedor-dialog";

const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" });

const COLUMNS: DataTableColumn<ProveedorConInventario>[] = [
  {
    header: "Proveedor",
    cell: (proveedor) => <span className="font-medium">{proveedor.nombre}</span>,
  },
  {
    header: "Contacto",
    cell: (proveedor) => proveedor.contacto ?? <span className="text-muted-foreground">—</span>,
  },
  {
    header: "Teléfono",
    cell: (proveedor) => <span className="font-mono text-sm">{proveedor.telefono ?? "—"}</span>,
  },
  {
    header: "Correo",
    cell: (proveedor) => <span className="text-muted-foreground">{proveedor.email ?? "—"}</span>,
  },
  {
    header: "Referencias",
    cell: (proveedor) => <span className="font-mono">{proveedor.repuestos.length}</span>,
  },
  {
    header: "Última entrada",
    cell: (proveedor) =>
      proveedor.entradas[0] ? (
        <span className="text-sm text-muted-foreground">{formatoFecha.format(proveedor.entradas[0].createdAt)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    header: "Acciones",
    cell: (proveedor) => (
      <EditarProveedorDialog
        proveedor={{
          id: proveedor.id,
          nombre: proveedor.nombre,
          contacto: proveedor.contacto,
          telefono: proveedor.telefono,
          email: proveedor.email,
        }}
      />
    ),
  },
];

export default async function ProveedoresPage() {
  const proveedores = await listProveedoresConInventario();

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Proveedores</h1>
          <p className="text-sm text-muted-foreground">{proveedores.length} proveedores registrados</p>
        </div>
        <Link href="/proveedores/nuevo" className={buttonVariants({})}>
          Nuevo proveedor
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={COLUMNS}
            rows={proveedores}
            getRowKey={(proveedor) => proveedor.id}
            emptyMessage="No hay proveedores registrados."
          />
        </CardContent>
      </Card>
    </main>
  );
}
