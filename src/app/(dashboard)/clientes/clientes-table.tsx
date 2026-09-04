import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { inferirColorVehiculo } from "@/lib/color-vehiculo";
import { formatoFechaCorta, formatoFechaRelativa } from "@/lib/fecha-bogota";
import { cn } from "@/lib/utils";

export interface ClienteRow {
  id: string;
  nombre: string;
  documento: string | null;
  telefono: string | null;
  email: string | null;
  vehiculos: { placa: string; color: string | null }[];
  ultimaVisita: Date | null;
  ordenesCount: number;
  saldo: number;
}

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function ClientesTable({ clientes, ahora }: { clientes: ClienteRow[]; ahora: Date }) {
  const COLUMNS: DataTableColumn<ClienteRow>[] = [
    {
      header: "Cliente",
      cell: (cliente) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{cliente.nombre}</span>
          <span className="text-xs text-muted-foreground">{cliente.documento ?? "—"}</span>
        </div>
      ),
      searchValue: (cliente) => `${cliente.nombre} ${cliente.documento ?? ""}`,
    },
    {
      header: "Teléfono",
      cell: (cliente) => <span className="font-mono text-sm">{cliente.telefono ?? "—"}</span>,
      searchValue: (cliente) => cliente.telefono ?? "",
    },
    {
      header: "Correo",
      cell: (cliente) => <span className="text-muted-foreground">{cliente.email ?? "—"}</span>,
    },
    {
      header: "Vehículos",
      cell: (cliente) =>
        cliente.vehiculos.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {cliente.vehiculos.map((vehiculo) => {
              const tono = inferirColorVehiculo(vehiculo.color);
              return (
                <Badge
                  key={vehiculo.placa}
                  variant="outline"
                  className={cn("font-mono", tono && "border-transparent", tono?.bg, tono?.text)}
                >
                  {vehiculo.placa}
                </Badge>
              );
            })}
          </div>
        ),
    },
    {
      header: "Última visita",
      cell: (cliente) =>
        cliente.ultimaVisita ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm">{formatoFechaCorta.format(cliente.ultimaVisita)}</span>
            <span className="text-xs text-muted-foreground">
              {formatoFechaRelativa(cliente.ultimaVisita, ahora)}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: "Órdenes",
      cell: (cliente) => <span className="font-mono">{cliente.ordenesCount}</span>,
      className: "text-right",
    },
    {
      header: "Saldo",
      cell: (cliente) =>
        cliente.saldo > 0 ? (
          <span className="font-mono font-medium text-[oklch(0.5_0.2_27)]">{formatoMoneda.format(cliente.saldo)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      className: "text-right",
    },
  ];

  return (
    <DataTable
      columns={COLUMNS}
      rows={clientes}
      getRowKey={(cliente) => cliente.id}
      rowHref={(cliente) => `/clientes/${cliente.id}`}
      emptyMessage={
        clientes.length === 0 ? "No hay clientes registrados." : "Ningún cliente coincide con la búsqueda."
      }
      searchable
      searchPlaceholder="Buscar por nombre, documento o teléfono..."
      pageSize={20}
      headerClassName="bg-muted"
    />
  );
}
