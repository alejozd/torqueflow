import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getVehiculo } from "@/app/actions/vehiculo-actions";
import { listOrdenesByVehiculo, listTecnicos, type OrdenDeVehiculo } from "@/app/actions/orden-actions";
import { listMarcasVehiculo, listTodosLosModelosVehiculo } from "@/app/actions/vehiculo-marca-modelo-actions";
import { EditarVehiculoDialog } from "../../clientes/[id]/editar-vehiculo-dialog";
import { NuevaOrdenDialog } from "../../clientes/[id]/nueva-orden-dialog";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/guards";
import { totalOrden } from "@/lib/dashboard/calculos";
import type { EstadoOrden } from "@/generated/prisma-tenant";

const ESTADO_LABELS: Record<EstadoOrden, string> = {
  BORRADOR: "Borrador",
  EN_PROCESO: "En proceso",
  TERMINADA: "Terminada",
  ENTREGADA: "Entregada",
  ANULADA: "Anulada",
};

// Same palette as clientes/[id] and ordenes/page.tsx: amber for active work,
// blue for finished-but-not-delivered, green for delivered, default/destructive
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
// state (terminada/entregada/anulada) yet -- same rule as clientes/[id].
const ESTADOS_ACTIVOS: EstadoOrden[] = ["BORRADOR", "EN_PROCESO"];

const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" });

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/**
 * A ya-facturada orden uses factura.total (the real invoiced amount, with
 * descuento/iva applied) instead of recomputing from items/manoDeObra, which
 * would drift from it -- same rule ordenes/page.tsx and dashboard-actions.ts
 * apply.
 */
function calcularTotalOrden(orden: OrdenDeVehiculo): number {
  if (orden.factura) return Number(orden.factura.total);
  return totalOrden({
    items: orden.items.map((item) => ({ cantidad: item.cantidad, precioUnitario: Number(item.precioUnitario) })),
    manoDeObra: orden.manoDeObra.map((linea) => ({ valor: Number(linea.valor) })),
  });
}

export default async function VehiculoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vehiculo = await getVehiculo(id);

  if (!vehiculo) {
    notFound();
  }

  const [ordenes, tecnicos, session, marcas, modelos] = await Promise.all([
    listOrdenesByVehiculo(id),
    listTecnicos(),
    requireSession(),
    listMarcasVehiculo(),
    listTodosLosModelosVehiculo(),
  ]);
  const esAdmin = session.user.role === "ADMIN";

  const enTaller = ordenes.some((orden) => ESTADOS_ACTIVOS.includes(orden.estado));

  // ordenes is sorted desc by createdAt, so the first one with a recorded
  // kilometraje is the most recent -- same derivation clientes/[id] uses for
  // its vehicle cards. Falls back to the vehículo's own stored field (set
  // from its edit form) when no orden has recorded one yet.
  const kilometrajeActual =
    ordenes.find((orden) => orden.kilometrajeIngreso !== null)?.kilometrajeIngreso ?? vehiculo.kilometraje;

  // The whole row is clickable via DataTable's rowHref (a stretched link),
  // not a per-cell <Link> -- one unified hover/cursor/click target instead of
  // fragmented underlines per cell.
  const ORDENES_COLUMNS: DataTableColumn<OrdenDeVehiculo>[] = [
    {
      header: "Fecha",
      cell: (orden) => <span className="text-sm text-muted-foreground">{formatoFecha.format(orden.createdAt)}</span>,
    },
    {
      header: "Síntomas",
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
      cell: (orden) => (
        <span className="font-mono font-medium">{formatoMoneda.format(calcularTotalOrden(orden))}</span>
      ),
      className: "text-right",
    },
  ];

  return (
    <main className="flex flex-col gap-6">
      <Link
        href={`/clientes/${vehiculo.clienteId}`}
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {vehiculo.cliente.nombre}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-2xl font-semibold">{vehiculo.placa}</h1>
            <Badge
              variant={enTaller ? undefined : "outline"}
              className={enTaller ? "border-transparent bg-[oklch(0.7_0.15_60/0.15)] text-[oklch(0.55_0.15_60)]" : ""}
            >
              {enTaller ? "En taller" : "Sin novedad"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {vehiculo.marca} {vehiculo.modelo} {vehiculo.anio ?? ""} ·{" "}
            {kilometrajeActual !== null
              ? `${kilometrajeActual.toLocaleString("es-CO")} km`
              : "Kilometraje no registrado"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <EditarVehiculoDialog vehiculo={vehiculo} marcas={marcas} modelos={modelos} esAdmin={esAdmin} />
          <NuevaOrdenDialog
            clienteId={vehiculo.clienteId}
            vehiculoId={vehiculo.id}
            placa={vehiculo.placa}
            tecnicos={tecnicos}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Órdenes de trabajo</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={ORDENES_COLUMNS}
                rows={ordenes}
                getRowKey={(orden) => orden.id}
                rowHref={(orden) => `/ordenes/${orden.id}`}
                emptyMessage="Este vehículo no tiene órdenes de trabajo."
              />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Propietario</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Cliente</p>
                <Link href={`/clientes/${vehiculo.clienteId}`} className="text-sm font-medium hover:underline">
                  {vehiculo.cliente.nombre}
                </Link>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Teléfono</p>
                <p className="font-mono text-sm">{vehiculo.cliente.telefono ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Correo</p>
                <p className="text-sm">{vehiculo.cliente.email ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Documento</p>
                <p className="font-mono text-sm">{vehiculo.cliente.documento ?? "—"}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
