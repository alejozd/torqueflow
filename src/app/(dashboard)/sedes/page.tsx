import { listSedesConMetricas, type SedeConMetricas } from "@/app/actions/sede-actions";
import { NuevaSedeDialog } from "./nueva-sede-dialog";
import { EditarSedeDialog } from "./editar-sede-dialog";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const COLUMNS: DataTableColumn<SedeConMetricas>[] = [
  {
    header: "Sede",
    cell: (sede) => (
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">{sede.nombre}</span>
        <span className="text-xs text-muted-foreground">{sede.direccion ?? "—"}</span>
      </div>
    ),
  },
  {
    header: "Usuarios asignados",
    className: "text-right",
    cell: (sede) => <span className="font-mono">{sede.usuariosAsignados}</span>,
  },
  {
    header: "Órdenes abiertas",
    className: "text-right",
    cell: (sede) =>
      sede.ordenesAbiertas > 0 ? (
        <span className="font-mono font-medium text-[oklch(0.55_0.15_60)]">{sede.ordenesAbiertas}</span>
      ) : (
        <span className="font-mono text-muted-foreground">0</span>
      ),
  },
  {
    header: "Acciones",
    cell: (sede) => <EditarSedeDialog sede={sede} />,
  },
];

export default async function SedesPage() {
  const sedes = await listSedesConMetricas();

  const totalUsuariosAsignados = sedes.reduce((suma, sede) => suma + sede.usuariosAsignados, 0);
  const totalOrdenesAbiertas = sedes.reduce((suma, sede) => suma + sede.ordenesAbiertas, 0);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Sedes</h1>
          <p className="text-sm text-muted-foreground">{sedes.length} sedes registradas</p>
        </div>
        <NuevaSedeDialog />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Sedes</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-2xl font-semibold">{sedes.length}</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Usuarios asignados</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-2xl font-semibold">{totalUsuariosAsignados}</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Órdenes abiertas</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-2xl font-semibold">{totalOrdenesAbiertas}</span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            &quot;Usuarios asignados&quot; cuenta solo asignaciones explícitas por sede -- un administrador puede
            trabajar en cualquier sede aunque no aparezca aquí.
          </p>
          <DataTable
            columns={COLUMNS}
            rows={sedes}
            getRowKey={(sede) => sede.id}
            emptyMessage="No hay sedes registradas."
          />
        </CardContent>
      </Card>
    </main>
  );
}
