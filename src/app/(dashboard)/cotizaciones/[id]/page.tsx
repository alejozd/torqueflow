import Link from "next/link";
import { notFound } from "next/navigation";
import { getCotizacion } from "@/app/actions/cotizacion-actions";
import { listRepuestoOptions } from "@/app/actions/repuesto-actions";
import { AgregarItemCotizacionForm } from "./agregar-item-cotizacion-form";
import { EliminarItemCotizacionButton } from "./eliminar-item-cotizacion-button";
import { DescuentoCotizacionForm } from "./descuento-cotizacion-form";
import { EnviarCotizacionForm } from "./enviar-cotizacion-form";
import { DecisionCotizacionButtons } from "./decision-cotizacion-buttons";
import { RegistrarSeguimientoDialog } from "./registrar-seguimiento-dialog";
import type { EstadoCotizacion } from "@/generated/prisma-tenant";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Cotizacion = NonNullable<Awaited<ReturnType<typeof getCotizacion>>>;
type ItemRow = Cotizacion["items"][number];

// Same BORRADOR/ENVIADA/APROBADA/RECHAZADA/VENCIDA convention as
// cotizaciones/page.tsx -- kept local here too rather than extracted to a
// shared module neither page asked for.
const ESTADO_LABELS: Record<EstadoCotizacion, string> = {
  BORRADOR: "Borrador",
  ENVIADA: "Enviada",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
  VENCIDA: "Vencida",
};

const ESTADO_BADGE_VARIANT: Partial<Record<EstadoCotizacion, "outline" | "destructive" | "default">> = {
  BORRADOR: "outline",
  RECHAZADA: "destructive",
  VENCIDA: "default",
};

const ESTADO_BADGE_CLASSNAME: Record<EstadoCotizacion, string> = {
  BORRADOR: "",
  ENVIADA: "border-transparent bg-[oklch(0.44_0.12_250/0.1)] text-[oklch(0.44_0.12_250)]",
  APROBADA: "border-transparent bg-[oklch(0.4_0.1_150/0.1)] text-[oklch(0.4_0.1_150)]",
  RECHAZADA: "",
  VENCIDA: "",
};

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" });

function buildItemColumns(cotizacionId: string, puedeEditar: boolean): DataTableColumn<ItemRow>[] {
  const columns: DataTableColumn<ItemRow>[] = [
    {
      header: "Código",
      cell: (item) => (
        <span className="font-mono text-xs text-muted-foreground">{item.repuestoId ? item.repuestoId.slice(-6).toUpperCase() : "—"}</span>
      ),
    },
    {
      header: "Concepto",
      cell: (item) => <span className="text-sm">{item.descripcion}</span>,
    },
    {
      header: "Tipo",
      cell: (item) => (
        <Badge
          variant="outline"
          className={
            item.tipo === "REPUESTO"
              ? "border-transparent bg-[oklch(0.7_0.15_60/0.15)] text-[10px] text-[oklch(0.55_0.15_60)]"
              : "border-transparent bg-[oklch(0.44_0.12_250/0.1)] text-[10px] text-[oklch(0.44_0.12_250)]"
          }
        >
          {item.tipo === "REPUESTO" ? "Repuesto" : "Mano de obra"}
        </Badge>
      ),
    },
    {
      header: "Cant.",
      className: "text-right",
      cell: (item) => <span className="font-mono text-sm">{item.cantidad.toString()}</span>,
    },
    {
      header: "Precio unit.",
      className: "text-right",
      cell: (item) => <span className="font-mono text-sm text-muted-foreground">{formatoMoneda.format(Number(item.precioUnitario))}</span>,
    },
    {
      header: "Importe",
      className: "text-right",
      cell: (item) => (
        <span className="font-mono text-sm font-medium">{formatoMoneda.format(Number(item.cantidad) * Number(item.precioUnitario))}</span>
      ),
    },
  ];

  if (puedeEditar) {
    columns.push({
      header: "",
      className: "text-right",
      cell: (item) => <EliminarItemCotizacionButton itemId={item.id} cotizacionId={cotizacionId} />,
    });
  }

  return columns;
}

export default async function CotizacionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [cotizacion, repuestos] = await Promise.all([getCotizacion(id), listRepuestoOptions()]);

  if (!cotizacion) {
    notFound();
  }

  const puedeEditar = cotizacion.estado === "BORRADOR";
  const subtotalRepuestos = cotizacion.items
    .filter((item) => item.tipo === "REPUESTO")
    .reduce((suma, item) => suma + Number(item.cantidad) * Number(item.precioUnitario), 0);
  const subtotalManoObra = cotizacion.items
    .filter((item) => item.tipo === "MANO_OBRA")
    .reduce((suma, item) => suma + Number(item.cantidad) * Number(item.precioUnitario), 0);

  return (
    <main className="flex flex-col gap-4">
      <Link
        href="/cotizaciones"
        className="flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        ← Cotizaciones
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Cotización #{cotizacion.numero}</h1>
          <Badge variant={ESTADO_BADGE_VARIANT[cotizacion.estado]} className={ESTADO_BADGE_CLASSNAME[cotizacion.estado]}>
            {ESTADO_LABELS[cotizacion.estado]}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {cotizacion.vehiculo.placa} · {cotizacion.vehiculo.marca} {cotizacion.vehiculo.modelo} · {cotizacion.cliente.nombre} ·{" "}
          {cotizacion.motivo}
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Cliente y vehículo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Cliente</p>
                  <p className="text-sm">{cotizacion.cliente.nombre}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Teléfono</p>
                  <p className="text-sm">{cotizacion.cliente.telefono ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Vehículo</p>
                  <p className="font-mono text-sm">{cotizacion.vehiculo.placa}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Modelo</p>
                  <p className="text-sm">
                    {cotizacion.vehiculo.marca} {cotizacion.vehiculo.modelo}
                    {cotizacion.vehiculo.anio ? ` ${cotizacion.vehiculo.anio}` : ""}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Sede</p>
                  <p className="text-sm">{cotizacion.sede.nombre}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Creada por</p>
                  <p className="text-sm">
                    {cotizacion.creadoPor.nombre} · {formatoFecha.format(cotizacion.createdAt)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Conceptos cotizados{" "}
                <span className="font-normal text-muted-foreground">
                  · {cotizacion.items.length} {cotizacion.items.length === 1 ? "ítem" : "ítems"}
                </span>
              </CardTitle>
              <CardAction>
                <RegistrarSeguimientoDialog cotizacionId={cotizacion.id} />
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {puedeEditar ? <AgregarItemCotizacionForm cotizacionId={cotizacion.id} repuestos={repuestos} /> : null}
              <DataTable
                columns={buildItemColumns(cotizacion.id, puedeEditar)}
                rows={cotizacion.items}
                getRowKey={(item) => item.id}
                emptyMessage="Esta cotización no tiene conceptos agregados."
              />
            </CardContent>
          </Card>
        </div>

        <div className="sticky top-4 flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Resumen</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-0">
              <div className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-muted-foreground">Repuestos</span>
                <span className="font-mono">{formatoMoneda.format(subtotalRepuestos)}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-muted-foreground">Mano de obra</span>
                <span className="font-mono">{formatoMoneda.format(subtotalManoObra)}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono">{formatoMoneda.format(Number(cotizacion.subtotal))}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-muted-foreground">Descuento ({Number(cotizacion.descuentoPct)}%)</span>
                <span className="font-mono">−{formatoMoneda.format(Number(cotizacion.descuento))}</span>
              </div>
              {puedeEditar ? (
                <div className="py-1.5">
                  <DescuentoCotizacionForm cotizacionId={cotizacion.id} descuentoPct={Number(cotizacion.descuentoPct)} />
                </div>
              ) : null}
              <div className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-muted-foreground">IVA (19%)</span>
                <span className="font-mono">{formatoMoneda.format(Number(cotizacion.iva))}</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between border-t border-border pt-2.5">
                <span className="text-sm font-semibold">Total</span>
                <span className="font-mono text-lg font-semibold">{formatoMoneda.format(Number(cotizacion.total))}</span>
              </div>
            </CardContent>
          </Card>

          {cotizacion.estado === "BORRADOR" ? (
            <Card>
              <CardHeader>
                <CardTitle>Envío y vigencia</CardTitle>
              </CardHeader>
              <CardContent>
                <EnviarCotizacionForm cotizacionId={cotizacion.id} />
              </CardContent>
            </Card>
          ) : null}

          {cotizacion.estado === "ENVIADA" ? (
            <Card>
              <CardHeader>
                <CardTitle>Decisión del cliente</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {cotizacion.validaHasta ? (
                  <p className="text-sm text-muted-foreground">Válida hasta {formatoFecha.format(cotizacion.validaHasta)}</p>
                ) : null}
                <DecisionCotizacionButtons cotizacionId={cotizacion.id} />
              </CardContent>
            </Card>
          ) : null}

          {cotizacion.estado === "APROBADA" ? (
            <Card>
              <CardHeader>
                <CardTitle>Resultado</CardTitle>
              </CardHeader>
              <CardContent>
                {cotizacion.orden ? (
                  <Link href={`/ordenes/${cotizacion.orden.id}`} className="text-sm font-medium text-primary hover:underline">
                    Ver orden generada →
                  </Link>
                ) : (
                  <p className="text-sm text-muted-foreground">Cotización aprobada.</p>
                )}
              </CardContent>
            </Card>
          ) : null}

          {cotizacion.estado === "RECHAZADA" || cotizacion.estado === "VENCIDA" ? (
            <Card>
              <CardHeader>
                <CardTitle>Estado final</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={cn("text-sm text-muted-foreground")}>
                  Esta cotización quedó {ESTADO_LABELS[cotizacion.estado].toLowerCase()} y ya no admite cambios.
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </main>
  );
}
