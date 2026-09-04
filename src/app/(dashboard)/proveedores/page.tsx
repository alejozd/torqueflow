import Link from "next/link";
import { AlertCircle, Building2, CheckCircle, Package } from "lucide-react";
import { listProveedoresConInventario, type ProveedorConInventario } from "@/app/actions/proveedor-actions";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { KPI_TONE, KpiCard } from "@/components/ui/kpi-card";
import { formatoFechaCorta, formatoFechaRelativa, inicioMesBogota } from "@/lib/fecha-bogota";
import { cn } from "@/lib/utils";
import { EditarProveedorDialog } from "./editar-proveedor-dialog";

function buildColumns(ahora: Date): DataTableColumn<ProveedorConInventario>[] {
  return [
  {
    header: "Proveedor",
    cell: (proveedor) => <span className="font-medium">{proveedor.nombre}</span>,
    searchValue: (proveedor) => proveedor.nombre,
  },
  {
    header: "Contacto",
    cell: (proveedor) => proveedor.contacto ?? <span className="text-muted-foreground">—</span>,
    searchValue: (proveedor) => proveedor.contacto ?? "",
  },
  {
    header: "Teléfono",
    cell: (proveedor) => <span className="font-mono text-sm">{proveedor.telefono ?? "—"}</span>,
    searchValue: (proveedor) => proveedor.telefono ?? "",
  },
  {
    header: "Correo",
    cell: (proveedor) => <span className="text-muted-foreground">{proveedor.email ?? "—"}</span>,
    searchValue: (proveedor) => proveedor.email ?? "",
  },
  {
    header: "Referencias",
    className: "text-right",
    cell: (proveedor) => <span className="font-mono">{proveedor.repuestos.length}</span>,
  },
  {
    header: "Última entrada",
    cell: (proveedor) =>
      proveedor.entradas[0] ? (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm">{formatoFechaCorta.format(proveedor.entradas[0].createdAt)}</span>
          <span className="text-xs text-muted-foreground">
            {formatoFechaRelativa(proveedor.entradas[0].createdAt, ahora)}
          </span>
        </div>
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
}

export default async function ProveedoresPage() {
  const proveedores = await listProveedoresConInventario();

  const ahora = new Date();
  const inicioMes = inicioMesBogota(ahora);
  const referenciasSuministradas = proveedores.reduce((suma, proveedor) => suma + proveedor.repuestos.length, 0);
  const conEntradaEsteMes = proveedores.filter(
    (proveedor) => proveedor.entradas[0] && proveedor.entradas[0].createdAt >= inicioMes,
  ).length;
  const sinEntradas = proveedores.filter((proveedor) => proveedor.entradas.length === 0).length;

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold">Proveedores</h1>
            <Badge variant="outline" className="font-normal text-muted-foreground">
              {conEntradaEsteMes} con entrada este mes
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{proveedores.length} proveedores registrados</p>
        </div>
        <Link href="/proveedores/nuevo" className={buttonVariants({})}>
          Nuevo proveedor
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Proveedores"
          value={proveedores.length}
          icon={<Building2 className={cn("size-5", KPI_TONE.info.icon)} />}
          iconBgColor={KPI_TONE.info.iconBg}
          className={KPI_TONE.info.cardBg}
        />

        <KpiCard
          title="Referencias suministradas"
          value={referenciasSuministradas}
          icon={<Package className={cn("size-5", KPI_TONE.info.icon)} />}
          iconBgColor={KPI_TONE.info.iconBg}
          className={KPI_TONE.info.cardBg}
        />

        <KpiCard
          title="Con entrada este mes"
          value={conEntradaEsteMes}
          valueColor="success"
          icon={<CheckCircle className={cn("size-5", KPI_TONE.success.icon)} />}
          iconBgColor={KPI_TONE.success.iconBg}
          className={KPI_TONE.success.cardBg}
        />

        <KpiCard
          title="Sin entradas registradas"
          value={sinEntradas}
          valueColor="warning"
          icon={<AlertCircle className={cn("size-5", KPI_TONE.warning.icon)} />}
          iconBgColor={KPI_TONE.warning.iconBg}
          className={KPI_TONE.warning.cardBg}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={buildColumns(ahora)}
            rows={proveedores}
            getRowKey={(proveedor) => proveedor.id}
            emptyMessage="No hay proveedores registrados."
            searchable
            searchPlaceholder="Buscar por proveedor, contacto, teléfono o correo..."
            pageSize={10}
            headerClassName="bg-muted"
          />
        </CardContent>
      </Card>
    </main>
  );
}
