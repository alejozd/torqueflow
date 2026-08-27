import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrden } from "@/app/actions/orden-actions";
import { listRepuestoOptions } from "@/app/actions/repuesto-actions";
import { CambiarEstadoForm } from "./cambiar-estado-form";
import { AgregarItemForm } from "./agregar-item-form";
import { AgregarManoObraForm } from "./agregar-mano-obra-form";
import { DviChecklistForm } from "./dvi-checklist-form";
import { DviFotoForm } from "./dvi-foto-form";
import { GenerarFacturaForm } from "./generar-factura-form";
import type { DviChecklist } from "@/lib/dvi/checklist-items";
import type { EstadoOrden } from "@/generated/prisma-tenant";
import { totalOrden } from "@/lib/dashboard/calculos";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Orden = NonNullable<Awaited<ReturnType<typeof getOrden>>>;
type ItemRow = Orden["items"][number];
type ManoObraRow = Orden["manoDeObra"][number];
type FotoRow = NonNullable<Orden["dvi"]>["fotos"][number];

// Same estado label/badge convention as /ordenes' list page (see ordenes/page.tsx) --
// kept local here too rather than extracted to a shared module neither page asked for.
const ESTADO_LABELS: Record<EstadoOrden, string> = {
  BORRADOR: "Borrador",
  EN_PROCESO: "En proceso",
  TERMINADA: "Terminada",
  ENTREGADA: "Entregada",
  ANULADA: "Anulada",
};

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

const formatoFechaHora = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const ITEMS_COLUMNS: DataTableColumn<ItemRow>[] = [
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
          item.repuestoId
            ? "border-transparent bg-[oklch(0.7_0.15_60/0.15)] text-[10px] text-[oklch(0.55_0.15_60)]"
            : "border-transparent bg-[oklch(0.44_0.12_250/0.1)] text-[10px] text-[oklch(0.44_0.12_250)]"
        }
      >
        {item.repuestoId ? "Repuesto" : "Manual"}
      </Badge>
    ),
  },
  {
    header: "Cant.",
    cell: (item) => <span className="font-mono text-sm">{item.cantidad}</span>,
  },
  {
    header: "Unitario",
    cell: (item) => (
      <span className="font-mono text-sm text-muted-foreground">
        {formatoMoneda.format(Number(item.precioUnitario))}
      </span>
    ),
  },
  {
    header: "Importe",
    cell: (item) => (
      <span className="font-mono text-sm font-medium">
        {formatoMoneda.format(item.cantidad * Number(item.precioUnitario))}
      </span>
    ),
  },
];

const MANO_OBRA_COLUMNS: DataTableColumn<ManoObraRow>[] = [
  {
    header: "Trabajo",
    cell: (linea) => <span className="text-sm">{linea.descripcion}</span>,
  },
  {
    header: "Horas",
    cell: (linea) => <span className="font-mono text-sm">{linea.horas.toString()} h</span>,
  },
  {
    header: "Precio hora",
    cell: (linea) => (
      <span className="font-mono text-sm text-muted-foreground">{formatoMoneda.format(Number(linea.precioHora))}</span>
    ),
  },
  {
    header: "Importe",
    cell: (linea) => (
      <span className="font-mono text-sm font-medium">
        {formatoMoneda.format(Number(linea.horas) * Number(linea.precioHora))}
      </span>
    ),
  },
];

const FOTOS_COLUMNS: DataTableColumn<FotoRow>[] = [
  {
    header: "Foto",
    cell: (foto) => (
      <>
        {foto.momento === "ANTES" ? "Antes" : "Después"}:{" "}
        {/* eslint-disable-next-line @next/next/no-img-element -- auth-gated route, next/image's optimizer can't reach it */}
        <img src={foto.url} alt={`Foto ${foto.momento.toLowerCase()} de la inspección`} width={200} />
      </>
    ),
  },
];

function InfoField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-0.5 text-sm">{value}</div>
    </div>
  );
}

export default async function OrdenDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [orden, repuestos] = await Promise.all([getOrden(id), listRepuestoOptions()]);

  if (!orden) {
    notFound();
  }

  const repuestosTotal = orden.items.reduce((suma, item) => suma + item.cantidad * Number(item.precioUnitario), 0);
  const manoObraTotal = orden.manoDeObra.reduce(
    (suma, linea) => suma + Number(linea.horas) * Number(linea.precioHora),
    0,
  );
  const horasCargadas = orden.manoDeObra.reduce((suma, linea) => suma + Number(linea.horas), 0);
  const checklist = (orden.dvi?.checklist as DviChecklist | undefined) ?? null;
  const checklistValores = checklist ? Object.values(checklist) : [];
  const atencionCount = checklistValores.filter((v) => v === "ATENCION").length;
  const criticoCount = checklistValores.filter((v) => v === "CRITICO").length;
  const total = totalOrden({
    items: orden.items.map((item) => ({ cantidad: item.cantidad, precioUnitario: Number(item.precioUnitario) })),
    manoDeObra: orden.manoDeObra.map((linea) => ({
      horas: Number(linea.horas),
      precioHora: Number(linea.precioHora),
    })),
  });

  return (
    <main className="flex flex-col gap-4">
      <Link
        href="/ordenes"
        className="flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        ← Órdenes
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Orden — {orden.vehiculo.placa}</h1>
          <Badge variant={ESTADO_BADGE_VARIANT[orden.estado]} className={ESTADO_BADGE_CLASSNAME[orden.estado]}>
            {ESTADO_LABELS[orden.estado]}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {orden.vehiculo.marca} {orden.vehiculo.modelo}
          {orden.vehiculo.anio ? ` ${orden.vehiculo.anio}` : ""} · {orden.cliente.nombre}
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Información de la orden</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <div className="text-[10px] tracking-wide text-muted-foreground uppercase">Recepción</div>
                  <div className="grid grid-cols-2 gap-3">
                    <InfoField label="Sede" value={orden.sede.nombre} />
                    <InfoField label="Ingresó" value={formatoFechaHora.format(orden.createdAt)} />
                    <InfoField label="Km de ingreso" value={orden.kilometrajeIngreso ?? "—"} />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[10px] tracking-wide text-muted-foreground uppercase">Vehículo y cliente</div>
                  <div className="grid grid-cols-2 gap-3">
                    <InfoField label="Placa" value={<span className="font-mono">{orden.vehiculo.placa}</span>} />
                    <InfoField label="Vehículo" value={`${orden.vehiculo.marca} ${orden.vehiculo.modelo}`} />
                    <InfoField label="Cliente" value={orden.cliente.nombre} />
                    <InfoField label="Teléfono" value={orden.cliente.telefono ?? "—"} />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[10px] tracking-wide text-muted-foreground uppercase">Asignación</div>
                  <div className="grid grid-cols-2 gap-3">
                    <InfoField label="Mecánico" value={orden.mecanico?.nombre ?? "Sin asignar"} />
                    <InfoField label="Horas cargadas" value={`${horasCargadas} h`} />
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-1 text-[10px] tracking-wide text-muted-foreground uppercase">
                  Síntomas reportados
                </div>
                <p className="max-w-[78ch] text-sm leading-relaxed">{orden.sintomas ?? "—"}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Ítems (repuestos){" "}
                <span className="font-normal text-muted-foreground">
                  · {orden.items.length} {orden.items.length === 1 ? "ítem" : "ítems"}
                </span>
              </CardTitle>
              <CardAction>
                <span className="font-mono text-sm text-muted-foreground">{formatoMoneda.format(repuestosTotal)}</span>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {!orden.factura && <AgregarItemForm ordenId={orden.id} repuestos={repuestos} />}
              <DataTable
                columns={ITEMS_COLUMNS}
                rows={orden.items}
                getRowKey={(item) => item.id}
                emptyMessage="Esta orden no tiene ítems agregados."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Mano de obra{" "}
                <span className="font-normal text-muted-foreground">
                  · {orden.manoDeObra.length} {orden.manoDeObra.length === 1 ? "línea" : "líneas"} · {horasCargadas} h
                </span>
              </CardTitle>
              <CardAction>
                <span className="font-mono text-sm text-muted-foreground">{formatoMoneda.format(manoObraTotal)}</span>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {!orden.factura && <AgregarManoObraForm ordenId={orden.id} />}
              <DataTable
                columns={MANO_OBRA_COLUMNS}
                rows={orden.manoDeObra}
                getRowKey={(linea) => linea.id}
                emptyMessage="Esta orden no tiene mano de obra registrada."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Inspección vehicular digital (DVI)</CardTitle>
              {atencionCount + criticoCount > 0 ? (
                <CardAction>
                  <span className="text-xs text-muted-foreground">
                    {atencionCount > 0
                      ? `${atencionCount} ${atencionCount === 1 ? "punto requiere" : "puntos requieren"} atención`
                      : null}
                    {atencionCount > 0 && criticoCount > 0 ? " · " : null}
                    {criticoCount > 0 ? `${criticoCount} crítico${criticoCount > 1 ? "s" : ""}` : null}
                  </span>
                </CardAction>
              ) : null}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <DviChecklistForm ordenId={orden.id} checklist={checklist} />
              <DviFotoForm ordenId={orden.id} />
              <DataTable
                columns={FOTOS_COLUMNS}
                rows={orden.dvi?.fotos ?? []}
                getRowKey={(foto) => foto.id}
                emptyMessage="Esta orden no tiene fotos de inspección."
              />
            </CardContent>
          </Card>
        </div>

        <div className="sticky top-4 flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Totales</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-0">
              <div className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-muted-foreground">Repuestos</span>
                <span className="font-mono">{formatoMoneda.format(repuestosTotal)}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-muted-foreground">Mano de obra</span>
                <span className="font-mono">{formatoMoneda.format(manoObraTotal)}</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between border-t border-border pt-2.5">
                <span className="text-sm font-semibold">Total estimado</span>
                <span className="font-mono text-lg font-semibold">{formatoMoneda.format(total)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Estado: {ESTADO_LABELS[orden.estado]}</CardTitle>
            </CardHeader>
            <CardContent>
              <CambiarEstadoForm ordenId={orden.id} estadoActual={orden.estado} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Facturación</CardTitle>
            </CardHeader>
            <CardContent>
              {orden.factura ? (
                <p>
                  <Link href={`/facturas/${orden.factura.id}`}>Ver factura #{orden.factura.numero}</Link>
                </p>
              ) : orden.estado === "TERMINADA" || orden.estado === "ENTREGADA" ? (
                <GenerarFacturaForm ordenId={orden.id} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  La orden debe estar Terminada o Entregada para poder facturarse.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
