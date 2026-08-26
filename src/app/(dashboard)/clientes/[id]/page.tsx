import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCliente } from "@/app/actions/cliente-actions";
import { EditarClienteDialog } from "./editar-cliente-dialog";
import { NuevoVehiculoDialog } from "./nuevo-vehiculo-dialog";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { EstadoOrden } from "@/generated/prisma-tenant";
import type { ClienteDetalle } from "@/app/actions/cliente-actions";

const ESTADO_LABELS: Record<EstadoOrden, string> = {
  BORRADOR: "Borrador",
  EN_PROCESO: "En proceso",
  TERMINADA: "Terminada",
  ENTREGADA: "Entregada",
  ANULADA: "Anulada",
};

// Same palette as ordenes/page.tsx: amber for active work, blue for
// finished-but-not-delivered, green for delivered, default/destructive
// outline for borrador/anulada.
const ESTADO_BADGE_CLASSNAME: Record<EstadoOrden, string> = {
  BORRADOR: "",
  EN_PROCESO: "border-transparent bg-[oklch(0.7_0.15_60/0.15)] text-[oklch(0.55_0.15_60)]",
  TERMINADA: "border-transparent bg-[oklch(0.44_0.12_250/0.1)] text-[oklch(0.44_0.12_250)]",
  ENTREGADA: "border-transparent bg-[oklch(0.4_0.1_150/0.1)] text-[oklch(0.4_0.1_150)]",
  ANULADA: "",
};

const ESTADO_BADGE_VARIANT: Partial<Record<EstadoOrden, "outline" | "destructive">> = {
  BORRADOR: "outline",
  ANULADA: "destructive",
};

// A vehículo is "en taller" while it has an orden that hasn't reached a final
// state (terminada/entregada/anulada) yet.
const ESTADOS_ACTIVOS: EstadoOrden[] = ["BORRADOR", "EN_PROCESO"];

const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" });
const formatoMesAnio = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" });

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function getIniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase();
  return (partes[0]!.charAt(0) + partes[1]!.charAt(0)).toUpperCase();
}

type OrdenDeCliente = ClienteDetalle["ordenes"][number];
type VehiculoDeCliente = ClienteDetalle["vehiculos"][number];

interface VehiculoResumen {
  vehiculo: VehiculoDeCliente;
  enTaller: boolean;
  kilometraje: number | null;
  ordenesCount: number;
}

function resumirVehiculo(vehiculo: VehiculoDeCliente, ordenes: OrdenDeCliente[]): VehiculoResumen {
  const ordenesDelVehiculo = ordenes.filter((orden) => orden.vehiculoId === vehiculo.id);
  const enTaller = ordenesDelVehiculo.some((orden) => ESTADOS_ACTIVOS.includes(orden.estado));

  // ordenes is already sorted desc by createdAt, so the first one with a
  // recorded kilometraje is the most recent.
  const masReciente = ordenesDelVehiculo.find((orden) => orden.kilometrajeIngreso !== null);

  return {
    vehiculo,
    enTaller,
    kilometraje: masReciente?.kilometrajeIngreso ?? null,
    ordenesCount: ordenesDelVehiculo.length,
  };
}

export default async function ClienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cliente = await getCliente(id);

  if (!cliente) {
    notFound();
  }

  const placaPorVehiculo = new Map(cliente.vehiculos.map((vehiculo) => [vehiculo.id, vehiculo.placa]));
  const vehiculosResumen = cliente.vehiculos.map((vehiculo) => resumirVehiculo(vehiculo, cliente.ordenes));

  const facturado = cliente.facturas.reduce((suma, factura) => suma + Number(factura.total), 0);
  const saldo = cliente.facturas
    .filter((factura) => factura.estado === "PENDIENTE")
    .reduce((suma, factura) => suma + Number(factura.saldoPendiente), 0);
  const ticketMedio = cliente.facturas.length > 0 ? facturado / cliente.facturas.length : null;

  const HISTORIAL_COLUMNS: DataTableColumn<OrdenDeCliente>[] = [
    {
      header: "Fecha",
      cell: (orden) => <span className="text-sm text-muted-foreground">{formatoFecha.format(orden.createdAt)}</span>,
    },
    {
      header: "Placa",
      cell: (orden) => <span className="font-mono text-sm">{placaPorVehiculo.get(orden.vehiculoId) ?? "—"}</span>,
    },
    {
      header: "Trabajo",
      cell: (orden) => orden.sintomas ?? <span className="text-muted-foreground">—</span>,
    },
    {
      header: "Estado",
      cell: (orden) => (
        <Badge variant={ESTADO_BADGE_VARIANT[orden.estado]} className={ESTADO_BADGE_CLASSNAME[orden.estado]}>
          {ESTADO_LABELS[orden.estado]}
        </Badge>
      ),
    },
    {
      header: "Total",
      cell: (orden) =>
        orden.factura ? (
          <span className="font-mono font-medium">{formatoMoneda.format(Number(orden.factura.total))}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <main className="flex flex-col gap-6">
      <Link href="/clientes" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Clientes
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar size="lg" className="bg-[oklch(0.62_0.19_45/0.13)]">
            <AvatarFallback className="bg-transparent font-mono text-[oklch(0.42_0.14_45)]">
              {getIniciales(cliente.nombre)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <h1 className="text-2xl font-semibold">{cliente.nombre}</h1>
            <p className="font-mono text-xs text-muted-foreground">
              {cliente.documento ?? "Sin documento"} · cliente desde {formatoMesAnio.format(cliente.createdAt)}
            </p>
          </div>
        </div>
        <EditarClienteDialog cliente={cliente} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Vehículos · {cliente.vehiculos.length}</CardTitle>
              <NuevoVehiculoDialog clienteId={cliente.id} />
            </CardHeader>
            <CardContent>
              {vehiculosResumen.length === 0 ? (
                <p className="text-sm text-muted-foreground">Este cliente no tiene vehículos registrados.</p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {vehiculosResumen.map(({ vehiculo, enTaller, kilometraje, ordenesCount }) => (
                    <Link
                      key={vehiculo.id}
                      href={`/vehiculos/${vehiculo.id}`}
                      className="flex flex-col gap-2 rounded-lg border border-border p-4 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-sm font-medium">{vehiculo.placa}</span>
                        <Badge
                          variant={enTaller ? undefined : "outline"}
                          className={enTaller ? "border-transparent bg-[oklch(0.7_0.15_60/0.15)] text-[oklch(0.55_0.15_60)]" : ""}
                        >
                          {enTaller ? "En taller" : "Sin novedad"}
                        </Badge>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {vehiculo.marca} {vehiculo.modelo} {vehiculo.anio ?? ""}
                      </span>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Kilometraje: {kilometraje !== null ? `${kilometraje.toLocaleString("es-CO")} km` : "—"}</span>
                        <span>{ordenesCount} órdenes</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Historial de servicio</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={HISTORIAL_COLUMNS}
                rows={cliente.ordenes}
                getRowKey={(orden) => orden.id}
                emptyMessage="Este cliente no tiene órdenes registradas."
              />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Contacto</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Teléfono</p>
                <p className="font-mono text-sm">{cliente.telefono ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Correo</p>
                <p className="text-sm">{cliente.email ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Documento</p>
                <p className="font-mono text-sm">{cliente.documento ?? "—"}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resumen</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Órdenes</p>
                <p className="font-mono text-lg font-semibold">{cliente.ordenes.length}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Facturado</p>
                <p className="font-mono text-lg font-semibold">{formatoMoneda.format(facturado)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Saldo</p>
                <p className={cn("font-mono text-lg font-semibold", saldo > 0 && "text-[oklch(0.5_0.2_27)]")}>
                  {formatoMoneda.format(saldo)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ticket medio</p>
                <p className="font-mono text-lg font-semibold">
                  {ticketMedio !== null ? formatoMoneda.format(ticketMedio) : "—"}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
